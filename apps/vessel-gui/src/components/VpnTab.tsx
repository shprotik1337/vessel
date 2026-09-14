import { t } from "../i18n";
import { useApp } from "../store";

export function VpnTab() {
  const { lang } = useApp();
  return (
    <div>
      <div className="sett-hd">
        <div className="sett-title">{t(lang, "vpn.title")}</div>
        <div className="sett-sub">{t(lang, "vpn.sub")}</div>
      </div>
    </div>
  );
}
