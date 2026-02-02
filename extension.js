import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PowerManagerProxyInterface = `
<node>
  <interface name="org.freedesktop.UPower">
    <property name="OnBattery" type="b" access="read"/>
  </interface>
</node>`;


export default class RefreshRateGovernorExtension extends Extension {
    enable() {
        const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(PowerManagerProxyInterface);
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
                    this._logError(`Failed to connect to the ${proxy.g_interface_name} D-Bus interface`, error);
            }
        );
        this._powerManagerProxy.connectObject('g-properties-changed', (...[, properties]) => {
            if (properties.lookup_value('OnBattery', null) !== null)
                this._updateRefreshRate();
        }, this);
    }

    disable() {
        // This extension uses the 'unlock-dialog' session mode to be able
        // to switch the refresh rate when the screen is locked.
        this._powerManagerProxy.disconnectObject(this);
        delete this._powerManagerProxy;

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
        try {
            const [, output] = GLib.spawn_command_line_sync('displayctl get-default-output');
            if (output) {
                const connector = output.toString().trim();
                if (connector)
                    return connector;
            }
        } catch (e) {
            logError(e, 'Failed to get default output connector');
        }
        // Fallback to common connector names
        return 'eDP-1';
    }

    _updateRefreshRate() {
        if (this._powerManagerProxy?.OnBattery === null || !this._connectorName)
            return;

        let refreshRate;
        if (this._powerManagerProxy.OnBattery)
            refreshRate = this._settings.get_int('refresh-rate-battery');
        else
            refreshRate = this._settings.get_int('refresh-rate-ac');

        try {
            const command = `displayconfig-mutter set --connector ${this._connectorName} --refresh-rate ${refreshRate}`;
            GLib.spawn_command_line_async(command);
        } catch (e) {
            logError(e, `Failed to set refresh rate to ${refreshRate}`);
        }
    }
}
