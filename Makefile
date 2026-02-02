UUID = refresh-rate-governor@sasas991.github.io
EXTENSION_DIR = ~/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install uninstall clean

install:
	@echo "Installing extension..."
	@mkdir -p $(EXTENSION_DIR)/schemas
	@cp extension.js $(EXTENSION_DIR)/
	@cp prefs.js $(EXTENSION_DIR)/
	@cp metadata.json $(EXTENSION_DIR)/
	@cp -r schemas/* $(EXTENSION_DIR)/schemas/
	@glib-compile-schemas $(EXTENSION_DIR)/schemas/
	@echo "Extension installed to $(EXTENSION_DIR)"
	@echo "Restart GNOME Shell (Alt+F2, then 'r') or log out and back in"

uninstall:
	@echo "Uninstalling extension..."
	@rm -rf $(EXTENSION_DIR)
	@echo "Extension uninstalled"

clean:
	@echo "Cleaning..."
	@find . -name "*.gschema.compiled" -delete
	@echo "Clean complete"
