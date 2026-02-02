import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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
                    logError(error, `Failed to connect to the ${proxy.g_interface_name} D-Bus interface`);
            }
        );
        
        this._displayConfigProxy = new DisplayConfigProxy(
            Gio.DBus.session,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            (proxy, error) => {
                if (error)
                    logError(error, 'Failed to connect to org.gnome.Mutter.DisplayConfig');
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
                    logError(error, 'Failed to get current display state');
                    return;
                }
                
                const [serial, monitors, logicalMonitors, properties] = result;
                
                // Find the monitor with our connector name
                let targetMonitor = null;
                let targetMode = null;
                
                for (const monitor of monitors) {
                    const [monitorSpec, modes, monitorProps] = monitor;
                    const [connector] = monitorSpec;
                    
                    if (connector === this._connectorName) {
                        targetMonitor = monitor;
                        
                        // Find a mode with the desired refresh rate
                        for (const mode of modes) {
                            const [modeId, width, height, rate] = mode;
                            const modeRefreshRate = Math.round(rate);
                            
                            if (modeRefreshRate === refreshRate) {
                                targetMode = mode;
                                break;
                            }
                        }
                        break;
                    }
                }
                
                if (!targetMonitor || !targetMode) {
                    log(`Could not find monitor ${this._connectorName} or mode with ${refreshRate}Hz`);
                    return;
                }
                
                // Build the new logical monitors configuration
                const newLogicalMonitors = logicalMonitors.map(lm => {
                    const [x, y, scale, transform, primary, monitorsInLm, lmProps] = lm;
                    
                    const newMonitors = monitorsInLm.map(m => {
                        const [lmConnector, lmVendor, lmProduct, lmSerial] = m;
                        
                        if (lmConnector === this._connectorName) {
                            const [modeId] = targetMode;
                            return [lmConnector, modeId, {}];
                        } else {
                            // Keep existing mode for other monitors
                            // We need to find their current mode ID
                            for (const monitor of monitors) {
                                const [monitorSpec, modes] = monitor;
                                const [connector] = monitorSpec;
                                
                                if (connector === lmConnector && modes.length > 0) {
                                    return [lmConnector, modes[0][0], {}];
                                }
                            }
                            return [lmConnector, '', {}];
                        }
                    });
                    
                    return [x, y, scale, transform, primary, newMonitors];
                });
                
                // Apply the configuration (method 1 = verify, 2 = temporary, 0 = persistent)
                this._displayConfigProxy.ApplyMonitorsConfigRemote(
                    serial,
                    1, // Verify method
                    newLogicalMonitors,
                    {},
                    (result, error) => {
                        if (error)
                            logError(error, `Failed to apply refresh rate ${refreshRate}Hz`);
                        else
                            log(`Successfully set refresh rate to ${refreshRate}Hz`);
                    }
                );
            });
        } catch (e) {
            logError(e, `Failed to set refresh rate to ${refreshRate}`);
        }
    }
}