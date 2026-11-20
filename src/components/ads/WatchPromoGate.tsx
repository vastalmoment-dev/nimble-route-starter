import { useState, type ReactNode } from "react";
import { PromoPopup } from "./PromoPopup";

/** Children cannot start playback, request an embed, or autoplay behind the ad. */
export function WatchPromoGate({ children }: { children: ReactNode }) {
  const [released, setReleased] = useState(false);
  return <>
    <PromoPopup onContinue={() => setReleased(true)} />
    {released ? children : null}
  </>;
}