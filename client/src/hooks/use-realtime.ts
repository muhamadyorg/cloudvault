import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

function invalidateAll() {
  queryClient.invalidateQueries({ queryKey: ["/api/files"] });
  queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
  queryClient.invalidateQueries({ queryKey: ["/api/upload-requests"] });
  queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
}

export function useRealtimeUpdates() {
  const sseWorking = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(invalidateAll, 5000);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function connect() {
      if (esRef.current) esRef.current.close();

      const es = new EventSource("/api/events");
      esRef.current = es;
      let connectedTimeout: ReturnType<typeof setTimeout>;

      connectedTimeout = setTimeout(() => {
        if (!sseWorking.current) {
          startPolling();
        }
      }, 4000);

      es.onopen = () => {
        sseWorking.current = true;
        clearTimeout(connectedTimeout);
        stopPolling();
      };

      es.onmessage = (e) => {
        sseWorking.current = true;
        clearTimeout(connectedTimeout);
        stopPolling();
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
        clearTimeout(connectedTimeout);
        es.close();
        esRef.current = null;
        sseWorking.current = false;
        startPolling();
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          connect();
        }, 10000);
      };
    }

    connect();

    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    };
  }, []);
}
