DOMAIN="$1"

for PO in po/*.po; do
  LANG=${PO##*/}
  LANG=${LANG%.po}
  mkdir -p "./dist/locale/$LANG/LC_MESSAGES"
  msgfmt "$PO" -o "./dist/locale/$LANG/LC_MESSAGES/$DOMAIN.mo"
done
