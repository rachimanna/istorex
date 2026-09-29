"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseDevice, type DeviceInfo } from "@/lib/shared/device";
import { evaluateInstall, type PublicRelease } from "@/lib/shared/install";

/**
 * The Install button. It only ever links to a real mechanism (itms-services manifest, App Store /
 * TestFlight / developer URL, or the IPA file). There is no simulated progress: after the tap,
 * iOS itself shows the confirmation dialog and the download progress on the Home Screen icon.
 */
export function InstallPanel({ release, appUrl }: { release: PublicRelease | null; appUrl: string }) {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setDevice(parseDevice(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints, standalone: nav.standalone === true }));
  }, []);

  if (!release) {
    return <span className="btn" aria-disabled="true">Недоступно</span>;
  }
  const d = evaluateInstall(release, device, appUrl);
  const standaloneWarn = device?.standalone && d.action === "itms";

  return (
    <div className="stack">
      {d.blockers.length > 0 && (
        <div className="notice err">
          <strong>Установка сейчас невозможна</strong>
          <ul>{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {d.warnings.length > 0 && (
        <div className="notice warn">
          <ul style={{ margin: 0 }}>{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {standaloneWarn && <div className="notice info">Вы открыли iStoreX как веб-приложение с экрана «Домой». Если установка не начнётся, откройте эту страницу в Safari.</div>}
      {release.distribution === "AD_HOC_OTA" && release.udidRegistered === true && <div className="notice ok">Ваше устройство (UDID из профиля) есть в списке этой сборки.</div>}
      {release.distribution === "AD_HOC_OTA" && release.udidRegistered === null && (
        <Link href="/profile" className="footnote">Указать UDID устройства в профиле →</Link>
      )}
      <button className="btn btn-glass" style={{ alignSelf: "flex-start" }} onClick={() => setSheet(true)}>
        Пошаговая инструкция
      </button>
      {device?.iosVersion && <p className="caption" style={{ margin: 0 }}>Определено по браузеру: {device.kind === "ipad" ? "iPad" : "iPhone"}, iOS {device.iosVersion} (может быть неточным).</p>}
      {sheet && <Sheet d={d} release={release} standaloneWarn={!!standaloneWarn} device={device} onClose={() => setSheet(false)} />}
    </div>
  );
}

export function InstallButton({ release, appUrl }: { release: PublicRelease | null; appUrl: string }) {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [tapped, setTapped] = useState(false);
  useEffect(() => setDevice(parseDevice(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints })), []);
  if (!release) return <span className="btn" aria-disabled="true">Недоступно</span>;
  const d = evaluateInstall(release, device, appUrl);
  if (d.action === "none" || !d.url) return <span className="btn" aria-disabled="true">Недоступно</span>;
  return (
    <div className="stack" style={{ gap: 6, alignItems: "flex-start" }}>
      <a className="btn btn-primary" href={d.url} onClick={() => setTapped(true)} rel="noopener">
        {d.label}
      </a>
      {tapped && d.action === "itms" && <span className="caption">Подтвердите установку в окне iOS. Прогресс отображается на иконке на экране «Домой».</span>}
      {tapped && d.action === "download" && <span className="caption">Файл скачивается. Откройте его в AltStore/SideStore.</span>}
    </div>
  );
}

function Sheet({ d, release, standaloneWarn, device, onClose }: { d: ReturnType<typeof evaluateInstall>; release: PublicRelease; standaloneWarn: boolean; device: DeviceInfo | null; onClose: () => void }) {
  const disabled = d.action === "none" || !d.url;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Установка">
        <div className="grabber" />
        <div className="spread">
          <h2 className="title-2">Как установить</h2>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
        {d.blockers.length > 0 && (
          <div className="notice err" style={{ marginTop: 12 }}>
            <strong>Установка сейчас невозможна</strong>
            <ul>{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        {d.warnings.length > 0 && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <ul style={{ margin: 0 }}>{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
        {standaloneWarn && <div className="notice info" style={{ marginTop: 12 }}>Если установка не начнётся из режима веб-приложения, откройте страницу в Safari.</div>}
        <ol className="steps" style={{ marginTop: 12 }}>{d.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {release.distribution === "IPA_SIDELOAD" && (
          <p className="footnote">
            Источник для AltStore/SideStore: <span className="mono">{typeof window !== "undefined" ? `${location.origin}/altstore/source.json` : "/altstore/source.json"}</span>
          </p>
        )}
        {release.sha256 && <p className="caption mono">SHA-256: {release.sha256}</p>}
        {!disabled && (
          <a className="btn btn-primary btn-large" href={d.url!} rel="noopener" style={{ marginTop: 8 }}>
            {d.label}
          </a>
        )}
        {device && device.kind !== "iphone" && device.kind !== "ipad" && <p className="footnote" style={{ textAlign: "center" }}>Откройте эту страницу в Safari на iPhone.</p>}
      </div>
    </>
  );
}
