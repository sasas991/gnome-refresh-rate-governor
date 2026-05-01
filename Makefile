UUID=`jq -r '.uuid' metadata.json`
TAG=`jq -r '."version-name"' metadata.json`
PACKAGE_NAME=`jq -r '.name' metadata.json`
PACKAGE_URL=`jq -r '.url' metadata.json`
POT_FILE = po/example.pot
PO_FILES = $(wildcard po/*.po)
JS_FILES = $(wildcard ./*.js)

check:
	@printf "==> checking the working tree... "
	@sh -c 'if [ -z "`git status --porcelain=v1`" ]; then printf "clean\n"; else printf "working tree is dirty, please, commit changes\n" && false; fi'

tag:
	@printf "==> tagging...\n"
	@git tag -a "v$(TAG)" -m "Release $(TAG)"

pub:
	@printf "==> pushing...\n"
	@git push --atomic origin main "v$(TAG)"

install: build
	@printf "==> installing locally...\n"
	@gnome-extensions install --force $(UUID).shell-extension.zip
	@printf "Restart Gnome Shell session\n"

uninstall:
	@printf "==> uninstalling...\n"
	@gnome-extensions uninstall $(UUID)

reinstall: uninstall install
	@printf "==> reinstalling locally...\n"

po:
	@printf "==> translation...\n"
	@mkdir -p po
	@xgettext $(JS_FILES) \
		--keyword=_:1,2c \
		--from-code=UTF-8 \
		--package-name="$(PACKAGE_NAME)" \
		--copyright-holder="$(PACKAGE_NAME) contributors" \
		--msgid-bugs-address="$(PACKAGE_URL)/issues" \
		--output=po/example.pot
	@for file in $(PO_FILES); do \
		msgmerge -Uq --backup=off $$file $(POT_FILE); \
	done

clean:
	@printf "==> cleaning...\n"
	@rm -f $(UUID).shell-extension.zip
	@rm -f schemas/gschemas.compiled

build: clean
	@printf "==> packaging...\n"
	@gnome-extensions pack --force --extra-source="LICENSE"

release: check tag pub
	@printf "\nPublished at %s\n\n" "`date`"

.DEFAULT_GOAL := build
.PHONY: check tag pub install uninstall reinstall build clean release po
