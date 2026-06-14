import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PowerManagerProxyInterface = `
<node>
  <interface name="org.freedesktop.UPower">
    <property name="OnBattery" type="b" access="read"/>
  </interface>
</node>`;

const DisplayConfigInterface = `
<node>
  <interface name="org.gnome.Mutter.DisplayConfig">
    <method name="GetCurrentState">
      <arg name="serial" direction="out" type="u"/>
      <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})"/>
      <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})"/>
      <arg name="properties" direction="out" type="a{sv}"/>
    </method>
    <method name="ApplyMonitorsConfig">
      <arg name="serial" direction="in" type="u"/>
      <arg name="method" direction="in" type="u"/>
      <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))"/>
      <arg name="properties" direction="in" type="a{sv}"/>
    </method>
  </interface>
</node>`;

export default class RefreshRateGovernorExtension extends Extension {
    enable() {
        const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(PowerManagerProxyInterface);
        const DisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(DisplayConfigInterface);

        this._settings = this.getSettings();

        this._refreshRateAcId = this._settings.connect('changed::refresh-rate-ac', () => {
            if (this._powerManagerProxy?.OnBattery === false)
                this._updateRefreshRate();
        });

        this._refreshRateBatteryId = this._settings.connect('changed::refresh-rate-battery', () => {
            if (this._powerManagerProxy?.OnBattery === true)
                this._updateRefreshRate();
        });

        this._connectorName = this._getConnectorName();

        this._powerManagerProxy = new PowerManagerProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            (proxy, error) => {
                if (error)
                    console.error(`Refresh Rate Governor: failed to connect to ${proxy.g_interface_name}`, error);
            }
        );

        this._displayConfigProxy = new DisplayConfigProxy(
            Gio.DBus.session,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            (proxy, error) => {
                if (error)
                    console.error('Refresh Rate Governor: failed to connect to org.gnome.Mutter.DisplayConfig', error);
            }
        );

        this._powerManagerProxy.connectObject('g-properties-changed', (...[, properties]) => {
            if (properties.lookup_value('OnBattery', null) !== null)
                this._updateRefreshRate();
        }, this);

        // Set initial refresh rate
        this._updateRefreshRate();
    }

    disable() {
        this._powerManagerProxy?.disconnectObject(this);
        delete this._powerManagerProxy;
        delete this._displayConfigProxy;

        if (this._refreshRateBatteryId && this._settings) {
            this._settings.disconnect(this._refreshRateBatteryId);
            this._refreshRateBatteryId = null;
        }

        if (this._refreshRateAcId && this._settings) {
            this._settings.disconnect(this._refreshRateAcId);
            this._refreshRateAcId = null;
        }

        this._settings = null;
    }

    _getConnectorName() {
        // Use fallback immediately to avoid blocking with sync spawn
        // Async fetch of the actual connector name could be added later
        return 'eDP-1';
    }

    _updateRefreshRate() {
        if (this._powerManagerProxy?.OnBattery === null || !this._connectorName || !this._displayConfigProxy)
            return;

        let refreshRate;
        if (this._powerManagerProxy.OnBattery)
            refreshRate = this._settings.get_int('refresh-rate-battery');
        else
            refreshRate = this._settings.get_int('refresh-rate-ac');

        try {
            this._displayConfigProxy.GetCurrentStateRemote((result, error) => {
                if (error) {
                    console.error('Refresh Rate Governor: failed to get current display state', error);
                    return;
                }

                const [serial, monitors, logicalMonitors] = result;
                const desiredRate = Math.round(refreshRate);

                // Resolve each connector's currently-active mode in one pass.
                // On GNOME 50, VRR exposes a "fixed" and "variable" variant of
                // each (w,h,rate) tuple; the `is-current` property and the
                // `refresh-rate-mode` string in mode[6] are what we use to
                // preserve resolution and the VRR state when only changing rate.
                const currentModeByConnector = new Map();
                for (const monitor of monitors) {
                    const [[connector]] = monitor;
                    const modes = monitor[1];
                    const current = modes.find(m => unpackProp(m[6], 'is-current') === true);
                    if (current)
                        currentModeByConnector.set(connector, current);
                }

                const currentTargetMode = currentModeByConnector.get(this._connectorName);
                if (!currentTargetMode) {
                    console.debug(`Refresh Rate Governor: monitor ${this._connectorName} not found or has no active mode`);
                    return;
                }

                const [, curWidth, curHeight, curRate, , , curProps] = currentTargetMode;
                const curRrMode = unpackProp(curProps, 'refresh-rate-mode') ?? 'fixed';

                if (Math.round(curRate) === desiredRate) {
                    // Already at the target rate; nothing to apply.
                    return;
                }

                // Find a target mode that:
                //   - keeps the current resolution (don't accidentally downscale),
                //   - matches the requested refresh rate,
                //   - prefers the same refresh-rate-mode (fixed/variable) as now,
                //     so we don't unintentionally toggle VRR.
                const targetMonitor = monitors.find(m => m[0][0] === this._connectorName);
                const candidates = targetMonitor[1].filter(m => {
                    const [, w, h, rate] = m;
                    return w === curWidth && h === curHeight && Math.round(rate) === desiredRate;
                });
                const targetMode = candidates.find(m =>
                    (unpackProp(m[6], 'refresh-rate-mode') ?? 'fixed') === curRrMode
                ) ?? candidates[0];

                if (!targetMode) {
                    console.debug(`Refresh Rate Governor: no ${curWidth}x${curHeight}@${desiredRate}Hz mode on ${this._connectorName}`);
                    return;
                }

                // Build logical_monitors using each monitor's CURRENT mode id.
                // The previous code used modes[0][0] (just the first listed mode),
                // which on GNOME 50 is no longer the active one.
                const newLogicalMonitors = logicalMonitors.map(lm => {
                    const [x, y, scale, transform, primary, monitorsInLm] = lm;
                    const newMonitors = monitorsInLm.map(m => {
                        const lmConnector = m[0];
                        if (lmConnector === this._connectorName)
                            return [lmConnector, targetMode[0], {}];
                        const existing = currentModeByConnector.get(lmConnector);
                        return [lmConnector, existing ? existing[0] : '', {}];
                    });
                    return [x, y, scale, transform, primary, newMonitors];
                });

                // method=1 is "temporary" (per mutter DisplayConfig docs:
                // 0=verify, 1=temporary, 2=persistent). Temporary is what we
                // want here — runtime override, not user-config-level persist.
                this._displayConfigProxy.ApplyMonitorsConfigRemote(
                    serial,
                    1,
                    newLogicalMonitors,
                    {},
                    (_result, applyError) => {
                        if (applyError)
                            console.error(`Refresh Rate Governor: failed to apply ${refreshRate}Hz`, applyError);
                        else
                            console.debug(`Refresh Rate Governor: set refresh rate to ${refreshRate}Hz`);
                    }
                );
            });
        } catch (e) {
            console.error(`Refresh Rate Governor: failed to set refresh rate to ${refreshRate}`, e);
        }
    }
}

// `a{sv}` dict values may arrive as GLib.Variant or already unwrapped depending
// on the proxy build; handle both.
function unpackProp(props, key) {
    const v = props?.[key];
    if (v == null) return null;
    return typeof v.deepUnpack === 'function' ? v.deepUnpack() : v;
}
