"use client";

import { Trash2 } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";
import { setEditMode, useEditMode } from "@/lib/edit-mode";

/**
 * Switch for edit mode, at the bottom of the settings page.
 *
 * It lives here rather than in the catalog because it enables a destructive
 * action: putting it behind an explicit step avoids deleting a title by
 * accident while browsing the grid.
 */
export default function EditModeToggle() {
  const active = useEditMode();

  return (
    <SettingsSection
      title="Edit and remove"
      description="While this is on, every poster in the catalog shows a button to delete the title, and series get controls to change how many seasons you have watched. Use it to clear duplicates left over from imports or artwork matched to the wrong film. Deleting is permanent and only affects this catalog, not the streaming service it came from. Remember to turn it off when you are done."
    >
      <button
        type="button"
        onClick={() => setEditMode(!active)}
        className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors ${
          active
            ? "bg-red-500 text-white hover:bg-red-400"
            : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
        }`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.8} />
        {active ? "Turn off edit and remove" : "Turn on edit and remove"}
      </button>

      {active && (
        <p className="mt-3 text-xs text-red-400">
          Edit mode is on: you can delete titles from the catalog.
        </p>
      )}
    </SettingsSection>
  );
}
