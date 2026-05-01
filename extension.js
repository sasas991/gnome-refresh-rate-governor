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
        this._settings = null;
        this._brightnessAcId = null;
        this._brightnessBatteryId = null;
        this._brightnessManagerChangedId = null;
        this._powerManagerProxy = null;

        this._settings = this.getSettings();
        this._brightnessAcId = this._settings.connect('changed::brightness-ac', () => {
            if (this._powerManagerProxy?.OnBattery === false)
                this._updateScreenBrightness();
        });
        this._brightnessBatteryId = this._settings.connect('changed::brightness-battery', () => {
            if (this._powerManagerProxy?.OnBattery === true)
                this._updateScreenBrightness();
        });

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
            (_proxy, error) => {
                if (error) {
                    console.error('Failed to connect to the org.freedesktop.UPower D-Bus interface', error);
                    return;
                }
                this._powerManagerProxy?.connectObject('g-properties-changed', (_proxy2, properties) => {
                    if (properties.lookup_value('OnBattery', null) !== null)
                        this._updateScreenBrightness();
                }, this);
            }
        );
    }

    disable() {
        // This extension uses the 'unlock-dialog' session mode to be able
        // to switch the screen brightness when the screen is locked.
        if (this._powerManagerProxy) {
            this._powerManagerProxy.disconnectObject(this);
            this._powerManagerProxy = null;
        }

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
        if (!Main.brightnessManager?.globalScale || this._powerManagerProxy?.OnBattery == null)
            return;

        const key = this._powerManagerProxy.OnBattery ? 'brightness-battery' : 'brightness-ac';
        Main.brightnessManager.globalScale.value = this._settings.get_int(key) / 100;
    }
}
