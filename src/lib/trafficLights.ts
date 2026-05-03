import { invoke } from "@tauri-apps/api/core";

const isMacOS = navigator.userAgent.includes("Mac");

export async function repositionTrafficLights(): Promise<void> {
  if (!isMacOS) return;
  await invoke("reposition_traffic_lights");
}
