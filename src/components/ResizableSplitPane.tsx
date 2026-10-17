import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
} from "lucide-react";
import { usePersisted } from "@/lib/use-board";
import {
  clampPaneSize,
  paneSizeFromDelta,
  splitPaneConstraints,
  WORKSPACE_LAYOUT_RESET_EVENT,
  type SplitPaneSide,
} from "./resizable-split-pane.utils";

import "./resizable-split-pane.css";

type ResizableSplitPaneProps = {
  primary: ReactNode;
  secondary?: ReactNode;
  open?: boolean;
  keepSecondaryMounted?: boolean;
  showPanelActions?: boolean;
  side?: SplitPaneSide;
  storageKey: string;
  defaultSize: number;
  minSize: number;
  maxSize: number;
  minPrimarySize?: number;
  compactAt?: number;
  compactMode?: "overlay" | "hidden";
  step?: number;
  label: string;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
};

/**
 * A reusable primary/secondary workspace split. The secondary pane may sit on
 * either edge; its preferred width persists while its rendered width is always
 * constrained by the space the primary workspace needs to remain usable.
 */
export default function ResizableSplitPane({
  primary,
  secondary,
  open: controlledOpen,
  keepSecondaryMounted = false,
  showPanelActions = true,
  side = "end",
  storageKey,
  defaultSize,
  minSize,
  maxSize,
  minPrimarySize = 360,
  compactAt = 700,
  compactMode = "overlay",
  step = 12,
  label,
  className,
  primaryClassName,
  secondaryClassName,
}: ResizableSplitPaneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startSize: number } | null>(null);
  const [storedSize, setStoredSize] = usePersisted(storageKey, defaultSize);
  const [liveSize, setLiveSize] = useState(defaultSize);
  const [containerSize, setContainerSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [compactRevealed, setCompactRevealed] = useState(false);
  const hasSecondary = secondary !== null && secondary !== undefined && secondary !== false;
  const externallyOpen = controlledOpen ?? hasSecondary;
  const wasExternallyOpen = useRef(externallyOpen);
  const open = externallyOpen && !collapsed;
  const panelName = label.replace(/^Resize\s+/i, "");

  const restoreDefault = () => {
    setLiveSize(defaultSize);
    setStoredSize(defaultSize);
  };

  useEffect(() => {
    if (!dragging) setLiveSize(storedSize);
  }, [dragging, storedSize]);

  useEffect(() => {
    if (externallyOpen && !wasExternallyOpen.current) {
      setCollapsed(false);
      setCompactRevealed(false);
      restoreDefault();
    }
    wasExternallyOpen.current = externallyOpen;
    // Restore on a closed -> open transition, not on routine size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externallyOpen]);

  useEffect(() => {
    const reset = () => {
      setCollapsed(false);
      setCompactRevealed(false);
      restoreDefault();
    };
    window.addEventListener(WORKSPACE_LAYOUT_RESET_EVENT, reset);
    return () => window.removeEventListener(WORKSPACE_LAYOUT_RESET_EVENT, reset);
    // The event always restores the declared defaults for this mounted pane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSize]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => setContainerSize(root.getBoundingClientRect().width);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const { compact, availableMax } = splitPaneConstraints({
    containerSize,
    minSize,
    maxSize,
    minPrimarySize,
    compactAt,
  });

  useEffect(() => {
    if (!compact) setCompactRevealed(false);
  }, [compact]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const next = paneSizeFromDelta(drag.startSize, event.clientX - drag.startX, side);
      setLiveSize(next);
    };
    const finish = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      document.documentElement.classList.remove("is-resizing-split-pane");
      setStoredSize((current) => {
        const next = paneSizeFromDelta(drag.startSize, event.clientX - drag.startX, side);
        return Number.isFinite(next) ? clampPaneSize(next, minSize, availableMax) : current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.documentElement.classList.remove("is-resizing-split-pane");
    };
  }, [availableMax, dragging, minSize, setStoredSize, side]);

  const renderedSize = clampPaneSize(liveSize, minSize, availableMax);

  const commitSize = (next: number) => {
    const value = clampPaneSize(next, minSize, availableMax);
    setLiveSize(value);
    setStoredSize(value);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (compact || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startSize: renderedSize,
    };
    setLiveSize(renderedSize);
    setDragging(true);
    document.documentElement.classList.add("is-resizing-split-pane");
    event.preventDefault();
  };

  const CollapseIcon = side === "start" ? PanelLeftClose : PanelRightClose;
  const OpenIcon = side === "start" ? PanelLeftOpen : PanelRightOpen;
  const collapsePanel = () => {
    setCompactRevealed(false);
    setCollapsed(true);
  };
  const panelActions = (className: string) => (
    <div
      className={className}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`Reset ${panelName} width`}
        title={`Reset ${panelName} width`}
        onClick={restoreDefault}
      >
        <RotateCcw size={12} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Collapse ${panelName}`}
        title={`Collapse ${panelName}`}
        onClick={collapsePanel}
      >
        <CollapseIcon size={12} aria-hidden="true" />
      </button>
    </div>
  );
  const divider = (
    <div
      className="rsp-divider"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minSize}
      aria-valuemax={Math.round(availableMax)}
      aria-valuenow={Math.round(renderedSize)}
      aria-valuetext={`${Math.round(renderedSize)} pixels wide`}
      tabIndex={compact ? -1 : 0}
      onPointerDown={startDrag}
      onDoubleClick={restoreDefault}
      onKeyDown={(event) => {
        if (compact) return;
        const amount = event.shiftKey ? step * 4 : step;
        if (event.key === "Home") commitSize(minSize);
        else if (event.key === "End") commitSize(availableMax);
        else if (event.key === "Enter") restoreDefault();
        else if (event.key === "ArrowLeft")
          commitSize(renderedSize + (side === "end" ? amount : -amount));
        else if (event.key === "ArrowRight")
          commitSize(renderedSize + (side === "start" ? amount : -amount));
        else return;
        event.preventDefault();
      }}
    >
      {showPanelActions && panelActions("rsp-divider-actions")}
    </div>
  );

  const style = {
    "--rsp-secondary-size": `${Math.round(renderedSize)}px`,
    "--rsp-compact-size": `${Math.min(defaultSize, 480)}px`,
  } as CSSProperties;

  const primaryPane = (
    <div className={`rsp-primary${primaryClassName ? ` ${primaryClassName}` : ""}`}>{primary}</div>
  );
  const secondaryPane =
    hasSecondary && (open || keepSecondaryMounted) ? (
      <div
        className={`rsp-secondary rsp-secondary-${side}${open ? "" : " is-preserved-closed"}${secondaryClassName ? ` ${secondaryClassName}` : ""}`}
        aria-hidden={open ? undefined : true}
      >
        <div className="rsp-secondary-content">{secondary}</div>
        {compact &&
          showPanelActions &&
          (compactMode === "overlay" || compactRevealed) &&
          panelActions(`rsp-compact-actions rsp-compact-actions-${side}`)}
      </div>
    ) : null;

  const compactHidden = compact && compactMode === "hidden";
  const showReopen =
    showPanelActions &&
    hasSecondary &&
    externallyOpen &&
    (collapsed || (compactHidden && !compactRevealed));

  return (
    <div
      ref={rootRef}
      className={`rsp-root rsp-side-${side} rsp-compact-${compactMode}${open ? " is-open" : ""}${dragging ? " is-dragging" : ""}${compact ? " is-compact" : ""}${compactRevealed ? " is-compact-revealed" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {side === "start" && secondaryPane}
      {side === "start" && open && !compact && divider}
      {primaryPane}
      {side === "end" && open && !compact && divider}
      {side === "end" && secondaryPane}
      {showReopen && (
        <button
          type="button"
          className={`rsp-reopen rsp-reopen-${side}`}
          aria-label={`Expand ${panelName}`}
          title={`Expand ${panelName}`}
          onClick={() => {
            restoreDefault();
            setCollapsed(false);
            if (compactHidden) setCompactRevealed(true);
          }}
        >
          <OpenIcon size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
