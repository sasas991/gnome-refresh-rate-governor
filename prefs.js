import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScreenBrightnessGovernorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settingsPage = new SettingsPage(this.getSettings());
        window.add(settingsPage);
    }
}

function buildBrightnessRow(settings, key, title) {
    const spinBox = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 1,
        }),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(key, spinBox, 'value', Gio.SettingsBindFlags.DEFAULT);

    const row = new Adw.ActionRow({
        activatable_widget: spinBox,
        title,
    });
    row.add_suffix(spinBox);
    return row;
}

export const SettingsPage = GObject.registerClass(class ScreenBrightnessGovernorSettingsPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init();

        const screenBrightnessGroup = new Adw.PreferencesGroup({
            title: _('Screen Brightness'),
        });
        screenBrightnessGroup.add(buildBrightnessRow(settings, 'brightness-ac', _('On AC')));
        screenBrightnessGroup.add(buildBrightnessRow(settings, 'brightness-battery', _('On Battery')));
        this.add(screenBrightnessGroup);

        // -----------------------------------------------------------------------

        const aboutGroup = new Adw.PreferencesGroup();
        const githubLinkRow = new Adw.ActionRow({
            title: 'GitHub',
        });
        githubLinkRow.add_suffix(new Gtk.LinkButton({
            icon_name: 'adw-external-link-symbolic',
            uri: 'https://github.com/inbalboa/gnome-brightness-governor',
        }));
        aboutGroup.add(githubLinkRow);
        this.add(aboutGroup);

        // -----------------------------------------------------------------------

        const licenseLabel = _('This project is licensed under the GPL-3.0 License.');
        const urlLabel = _('See the %sLicense%s for details.').format('<a href="https://www.gnu.org/licenses/gpl.txt">', '</a>');

        const gnuSoftwareGroup = new Adw.PreferencesGroup();
        const gnuSofwareLabel = new Gtk.Label({
            label: `<span size="small">${licenseLabel}\n${urlLabel}</span>`,
            use_markup: true,
            justify: Gtk.Justification.CENTER,
        });

        const gnuSofwareLabelBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.END,
            vexpand: true,
            margin_top: 5,
            margin_bottom: 10,
        });
        gnuSofwareLabelBox.append(gnuSofwareLabel);
        gnuSoftwareGroup.add(gnuSofwareLabelBox);
        this.add(gnuSoftwareGroup);
    }
});
