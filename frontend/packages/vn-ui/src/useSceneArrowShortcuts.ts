import { useEffect } from "react";
import { useStorySessionStore } from "@local-vn/stores";

export function useSceneArrowShortcuts() {
  const busy = useStorySessionStore((state) => state.busy);
  const goToParent = useStorySessionStore((state) => state.goToParent);
  const goToFirstChild = useStorySessionStore((state) => state.goToFirstChild);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        busy ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        shouldIgnoreSceneArrowShortcut(event)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToParent();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToFirstChild();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, goToFirstChild, goToParent]);
}

function shouldIgnoreSceneArrowShortcut(event: KeyboardEvent): boolean {
  if (hasTextSelection()) {
    return true;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='listbox'], [role='spinbutton'], [role='slider']"
    )
  );
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}
