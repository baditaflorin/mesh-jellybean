import { useEffect, useState } from "react";
import { MeshShell } from "@baditaflorin/mesh-common";
import { Jellybean } from "./features/jellybean/Jellybean";
import { appConfig } from "./shared/config";

const STORAGE = {
  room: `${appConfig.storagePrefix}:room`,
};

export function App() {
  const [roomId, setRoomId] = useState(() => localStorage.getItem(STORAGE.room) ?? "default");

  useEffect(() => {
    localStorage.setItem(STORAGE.room, roomId);
  }, [roomId]);

  return (
    <MeshShell config={appConfig} roomId={roomId} onRoomChange={setRoomId}>
      <Jellybean roomId={roomId} />
    </MeshShell>
  );
}
