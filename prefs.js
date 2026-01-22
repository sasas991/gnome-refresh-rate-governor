import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RefreshRateGovernorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settingsPage = new SettingsPage(this.getSettings());
        window.add(settingsPage);
    }
}

export const SettingsPage = GObject.registerClass(class RefreshRateGovernorSettingsPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init();

        const refreshRateOnAcSpinBox = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 30,
                upper: 240,
                step_increment: 1,
            }),
            valign: Gtk.Align.CENTER,
            value: settings.get_int('refresh-rate-ac'),
        });
        refreshRateOnAcSpinBox.connect('value-changed', widget => settings.set_int('refresh-rate-ac', widget.get_value()));

        const refreshRateOnAcRow = new Adw.ActionRow({
            activatable_widget: refreshRateOnAcSpinBox,
            title: _('On AC'),
            subtitle: _('Refresh rate in Hz'),
        });
        refreshRateOnAcRow.add_suffix(refreshRateOnAcSpinBox);

        const refreshRateOnBatterySpinBox = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 30,
                upper: 240,
                step_increment: 1,
            }),
            valign: Gtk.Align.CENTER,
            value: settings.get_int('refresh-rate-battery'),
        });
        refreshRateOnBatterySpinBox.connect('value-changed', widget => settings.set_int('refresh-rate-battery', widget.get_value()));

        const refreshRateOnBatteryRow = new Adw.ActionRow({
            activatable_widget: refreshRateOnBatterySpinBox,
            title: _('On Battery'),
            subtitle: _('Refresh rate in Hz'),
        });
        refreshRateOnBatteryRow.add_suffix(refreshRateOnBatterySpinBox);

        const screenRefreshRateGroup = new Adw.PreferencesGroup({
            title: _('Screen Refresh Rate'),
        });
        screenRefreshRateGroup.add(refreshRateOnAcRow);
        screenRefreshRateGroup.add(refreshRateOnBatteryRow);
        this.add(screenRefreshRateGroup);

        // -----------------------------------------------------------------------

        const aboutGroup = new Adw.PreferencesGroup();
        const githubLinkRow = new Adw.ActionRow({
            title: 'GitHub',
        });
        githubLinkRow.add_suffix(new Gtk.LinkButton({
            icon_name: 'adw-external-link-symbolic',
            uri: 'https://github.com/sasas991/gnome-refresh-rate-governor',
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
