# Screen Refresh Rate Governor - GNOME Shell Extension
[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" height="100">](https://extensions.gnome.org/extension/8277/screen-brightness-governor/)

Automatically switch the screen refresh rate depending on the power supply status.

![Extension Screenshot](screenshot.png)

## Requirements

- GNOME Shell 48+

## Installation

### From GNOME Extensions

https://extensions.gnome.org/extension/8277/screen-brightness-governor/

### Manual Installation

1. **Download and install the extension files**

   ```sh
   git clone https://github.com/inbalboa/gnome-brightness-governor.git
   cd gnome-brightness-governor
   make install
   ```
   Requires `git`, `make`, `jq`

2. **Restart GNOME Shell**

   Log out and log back in.

3. **Enable the extension**
   ```sh
   gnome-extensions enable brightness-governor@inbalboa.github.io
   ```

## Acknowledgments

This extension is a fork of [Auto Screen Brightness](https://github.com/popov895/auto-screen-brightness) extension by [Eugene Popov](https://github.com/popov895) adapted to the latest GNOME Shell version. 

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.
