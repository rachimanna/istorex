import { compareVersions, type DeviceInfo } from "./device";

export type Distribution = "APP_STORE" | "TESTFLIGHT" | "AD_HOC_OTA" | "ENTERPRISE_OTA" | "EU_WEB_DISTRIBUTION" | "ALT_MARKETPLACE" | "IPA_SIDELOAD";
export type SigningStatus = "NOT_APPLICABLE" | "VALID" | "EXPIRING_SOON" | "EXPIRED" | "UNSIGNED" | "INVALID" | "UNKNOWN";

/** What the client receives about a release — never the UDID list itself. */
export type PublicRelease = {
  id: string;
  version: string;
  buildNumber: string;
  minIOS: string;
  sizeBytes: number;
  distribution: Distribution;
  externalUrl: string | null;
  signingStatus: SigningStatus;
  profileType: string;
  teamName: string | null;
  profileExpiresAt: string | null;
  provisionedDeviceCount: number;
  /** true / false when the signed-in user saved a UDID; null when unknown. */
  udidRegistered: boolean | null;
  supportsIphone: boolean;
  hasFile: boolean;
  sha256: string | null;
  ready: boolean;
  /** Server-side reasons hosted delivery is currently unavailable (budget, check failure...). */
  serverBlockers: string[];
};

export type InstallDecision = {
  action: "itms" | "external" | "download" | "none";
  label: string;
  url: string | null;
  blockers: string[];
  warnings: string[];
  steps: string[];
};

export const DISTRIBUTION_LABEL: Record<Distribution, string> = {
  APP_STORE: "App Store",
  TESTFLIGHT: "TestFlight (бета)",
  AD_HOC_OTA: "Ad Hoc (зарегистрированные устройства)",
  ENTERPRISE_OTA: "Enterprise In-House",
  EU_WEB_DISTRIBUTION: "Web Distribution (ЕС)",
  ALT_MARKETPLACE: "Альтернативный маркетплейс (ЕС)",
  IPA_SIDELOAD: "IPA для самостоятельной подписи",
};

export const SIGNING_LABEL: Record<SigningStatus, string> = {
  NOT_APPLICABLE: "Подписывает Apple / разработчик",
  VALID: "Подпись действительна",
  EXPIRING_SOON: "Подпись скоро истекает",
  EXPIRED: "Подпись истекла",
  UNSIGNED: "Не подписано",
  INVALID: "Подпись некорректна",
  UNKNOWN: "Статус подписи неизвестен",
};

export function installEndpoints(r: PublicRelease, appUrl: string) {
  const manifest = `${appUrl}/api/releases/${r.id}/manifest.plist`;
  return {
    itms: `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`,
    download: `/api/releases/${r.id}/download`,
    external: `/api/releases/${r.id}/open`,
  };
}

export function evaluateInstall(r: PublicRelease, d: DeviceInfo | null, appUrl: string): InstallDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const steps: string[] = [];
  const ep = installEndpoints(r, appUrl);
  const onIos = d?.kind === "iphone" || d?.kind === "ipad";

  if (!r.ready) blockers.push("Сборка ещё обрабатывается или не прошла проверку.");
  if (d && onIos && d.iosVersion && compareVersions(d.iosVersion, r.minIOS) < 0) {
    blockers.push(`Нужна iOS ${r.minIOS} или новее, а на этом устройстве, судя по браузеру, iOS ${d.iosVersion}.`);
  }
  if (d?.kind === "ipad" && !r.supportsIphone) blockers.push("Сборка не рассчитана на это устройство.");
  if (d && d.kind === "iphone" && !r.supportsIphone) blockers.push("Сборка не поддерживает iPhone.");

  switch (r.distribution) {
    case "APP_STORE":
      steps.push("Нажмите «Открыть в App Store».", "Установите приложение кнопкой «Загрузить» в App Store.");
      return { action: r.externalUrl ? "external" : "none", label: "Открыть в App Store", url: r.externalUrl ? ep.external : null, blockers, warnings, steps };

    case "TESTFLIGHT":
      warnings.push("Бета-версия через TestFlight: число мест ограничено разработчиком, сборка работает 90 дней.");
      steps.push("Установите TestFlight из App Store, если его ещё нет.", "Нажмите «Открыть в TestFlight» и примите приглашение.", "Нажмите «Установить» в TestFlight.");
      return { action: r.externalUrl ? "external" : "none", label: "Открыть в TestFlight", url: r.externalUrl ? ep.external : null, blockers, warnings, steps };

    case "EU_WEB_DISTRIBUTION":
      warnings.push("Web Distribution доступна только пользователям с Apple ID из стран ЕС, на iOS 17.5+, от авторизованного Apple разработчика.");
      steps.push("Нажмите «Перейти на сайт разработчика».", "Скачайте приложение на официальном сайте разработчика.", "Разрешите установку от разработчика в Настройки → Основные, если iOS попросит.");
      return { action: r.externalUrl ? "external" : "none", label: "Перейти на сайт разработчика", url: r.externalUrl ? ep.external : null, blockers, warnings, steps };

    case "ALT_MARKETPLACE":
      warnings.push("Альтернативные маркетплейсы работают только в ЕС (iOS 17.4+) и требуют установки самого маркетплейса.");
      steps.push("Нажмите «Открыть в маркетплейсе».", "Если маркетплейс не установлен, установите его по инструкции на его сайте.", "Установите приложение внутри маркетплейса.");
      return { action: r.externalUrl ? "external" : "none", label: "Открыть в маркетплейсе", url: r.externalUrl ? ep.external : null, blockers, warnings, steps };

    case "IPA_SIDELOAD":
      blockers.push(...r.serverBlockers);
      if (!r.hasFile) blockers.push("Файл сборки отсутствует.");
      warnings.push("Этот файл нельзя установить прямо из Safari. Его нужно подписать своим Apple ID через AltStore, SideStore или Xcode (с бесплатным Apple ID подпись действует 7 дней).");
      steps.push(
        "Установите AltStore или SideStore (в ЕС доступен AltStore PAL) либо используйте Xcode на Mac.",
        "Добавьте источник iStoreX в AltStore/SideStore или скачайте IPA кнопкой ниже.",
        "Откройте IPA в AltStore/SideStore — приложение будет подписано вашим Apple ID и установлено.",
        "Каждые 7 дней (бесплатный Apple ID) подпись нужно обновлять в AltStore/SideStore.",
      );
      return { action: blockers.length ? "none" : "download", label: "Скачать IPA", url: blockers.length ? null : ep.download, blockers, warnings, steps };

    case "AD_HOC_OTA":
    case "ENTERPRISE_OTA": {
      blockers.push(...r.serverBlockers);
      if (!r.hasFile) blockers.push("Файл сборки отсутствует.");
      if (r.signingStatus === "EXPIRED") blockers.push("Срок действия подписи истёк — iOS не установит эту сборку. Ожидайте переподписанную версию.");
      if (r.signingStatus === "UNSIGNED" || r.signingStatus === "INVALID") blockers.push("Сборка не подписана корректно — установка через iOS невозможна.");
      if (r.signingStatus === "EXPIRING_SOON") warnings.push("Подпись скоро истекает: после этого приложение перестанет запускаться до обновления.");
      if (d && !onIos) blockers.push("Установка по воздуху работает только на iPhone/iPad. Откройте эту страницу в Safari на iPhone.");
      if (d && onIos && d.browser !== "safari") warnings.push("Надёжнее всего установка работает из Safari. Если ничего не происходит — откройте страницу в Safari.");

      if (r.distribution === "AD_HOC_OTA") {
        if (r.udidRegistered === false) blockers.push("UDID вашего устройства (из профиля) не входит в список устройств этой Ad Hoc-сборки. iOS откажет в установке.");
        else if (r.udidRegistered === null)
          warnings.push(`Ad Hoc-сборка устанавливается только на ${r.provisionedDeviceCount} зарегистрированных устройств(а). Укажите UDID в профиле, чтобы проверить заранее.`);
        steps.push("Нажмите «Установить» и подтвердите запрос iOS «Установить».", "Иконка появится на экране «Домой»; дождитесь окончания загрузки.");
        if (r.profileType === "DEVELOPMENT") steps.push("Для Development-сборки включите Настройки → Конфиденциальность и безопасность → Режим разработчика и перезагрузите iPhone.");
      } else {
        warnings.push("Enterprise-сборки по правилам Apple предназначены только для сотрудников организации-владельца сертификата. Apple может отозвать сертификат, и приложение перестанет открываться.");
        steps.push(
          "Нажмите «Установить» и подтвердите запрос iOS.",
          "После загрузки откройте Настройки → Основные → VPN и управление устройством.",
          `Выберите разработчика «${r.teamName ?? "организации"}» и нажмите «Доверять».`,
          "Вернитесь на экран «Домой» и откройте приложение.",
        );
      }
      return { action: blockers.length ? "none" : "itms", label: "Установить", url: blockers.length ? null : ep.itms, blockers, warnings, steps };
    }
  }
}
