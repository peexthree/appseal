"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCookieConsent } from "@/components/cookie-consent";

const METRIKA_ID = 114248324;

type YmFn = (id: number, action: string, ...rest: unknown[]) => void;

// Official Yandex.Metrica snippet via next/script; SPA navigations are counted
// with an explicit hit() because the App Router never reloads the page.
// The script loads only after the visitor grants cookie consent (152-ФЗ / РКН):
// the banner stores the choice in localStorage, so no JS = no consent = no pixel.
export function YandexMetrika() {
  const pathname = usePathname();
  const firstPath = useRef(true);
  const consent = useCookieConsent();

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return; // первичный хит считает init
    }
    const ym = (window as unknown as { ym?: YmFn }).ym;
    if (typeof ym === "function") {
      ym(METRIKA_ID, "hit", window.location.href);
    }
  }, [pathname]);

  if (consent !== "granted") return null;

  return (
    <Script id="yandex-metrika" strategy="afterInteractive">
      {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}','ym');ym(${METRIKA_ID},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});`}
    </Script>
  );
}
