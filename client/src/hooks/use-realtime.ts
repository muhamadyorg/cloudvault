import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export function useRealtimeUpdates() {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      const es = new EventSource("/api/events");
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "files") {
            queryClient.invalidateQueries({ queryKey: ["/api/files"] });
            queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
          } else if (data.type === "folders") {
            queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
          } else if (data.type === "requests") {
            queryClient.invalidateQueries({ queryKey: ["/api/upload-requests"] });
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);
}
