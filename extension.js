import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PowerManagerProxyInterface = `
<node>
  <interface name="org.freedesktop.UPower">
    <property name="OnBattery" type="b" access="read"/>
  </interface>
</node>`;
const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(PowerManagerProxyInterface);

export default class ScreenBrightnessGovernorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._brightnessAcId = this._settings.connect('changed::brightness-ac', () => {
            if (this._powerManagerProxy?.OnBattery === false)
                this._updateScreenBrightness();
        });
        this._brightnessBatteryId = this._settings.connect('changed::brightness-battery', () => {
            if (this._powerManagerProxy?.OnBattery === true)
                this._updateScreenBrightness();
        });

        this._brightnessManagerChangedId = null;
        if (Main.brightnessManager) {
            this._brightnessManagerChangedId = Main.brightnessManager.connect('changed', () => {
                if (Main.brightnessManager.globalScale && this._brightnessManagerChangedId) {
                    Main.brightnessManager.disconnect(this._brightnessManagerChangedId);
                    this._brightnessManagerChangedId = null;
                    this._updateScreenBrightness();
                }
            });
        }

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
                this._updateScreenBrightness();
        }, this);
    }

    disable() {
        // This extension uses the 'unlock-dialog' session mode to be able
        // to switch the screen brightness when the screen is locked.
        this._powerManagerProxy.disconnectObject(this);
        this._powerManagerProxy = null;

        if (this._brightnessManagerChangedId && Main.brightnessManager) {
            Main.brightnessManager.disconnect(this._brightnessManagerChangedId);
            this._brightnessManagerChangedId = null;
        }

        if (this._brightnessBatteryId && this._settings) {
            this._settings.disconnect(this._brightnessBatteryId);
            this._brightnessBatteryId = null;
        }
        if (this._brightnessAcId && this._settings) {
            this._settings.disconnect(this._brightnessAcId);
            this._brightnessAcId = null;
        }
        this._settings = null;
    }

    _updateScreenBrightness() {
        if (!Main.brightnessManager?.globalScale || this._powerManagerProxy?.OnBattery === null)
            return;

        let brightnessPercent;
        if (this._powerManagerProxy.OnBattery)
            brightnessPercent = this._settings.get_int('brightness-battery');
        else
            brightnessPercent = this._settings.get_int('brightness-ac');

        // (0-100) to (0.0-1.0)
        const brightnessValue = Math.clamp(brightnessPercent / 100.0, 0.0, 1.0);
        Main.brightnessManager.globalScale.value = brightnessValue;
    }
}
