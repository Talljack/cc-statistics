# Custom Time Ranges Design

## 1. Summary

This document defines a flexible time range system for CC Statistics.

The goal is to keep the dashboard header fast and simple while allowing users to:

- Keep built-in ranges: `Today`, `Week`, `Month`, `All`
- Create reusable custom shortcuts in Settings
- Support both relative ranges and absolute date ranges
- Set either a built-in range or a custom shortcut as the default startup range
- Run one-off date range queries without polluting saved shortcuts

The recommended UX direction is:

- Dashboard header = quick query layer
- Settings page = time range management layer

## 2. Design Goals

- Preserve the current compact dark segmented-control style in the header
- Avoid turning the header into a full filtering workspace
- Make common custom ranges one click away
- Keep low-frequency configuration inside Settings
- Support both reusable shortcuts and temporary ad hoc queries
- Scale cleanly when users create many custom ranges

## 3. Non-Goals

- Replacing built-in ranges with fully user-defined tabs
- Adding horizontal scrolling to the header range control
- Auto-saving every ad hoc date query as a shortcut
- Introducing a separate full-screen range management page in V1

## 4. Information Architecture

### 4.1 Dashboard Header

The header time area is split into:

1. Built-in ranges
2. Visible custom shortcuts
3. Overflow entry

Final structure:

`Today | Week | Month | All | [custom 1] [custom 2] | More`

Rules:

- Built-in ranges are always visible
- At most 2 custom shortcuts are visible directly in the header
- Additional custom shortcuts are available through `More`
- The header never becomes horizontally scrollable

### 4.2 Settings Page

The current "default time range" setting expands into a full "Time Range Management" section.

It contains:

1. Default time range
2. Header shortcuts
3. All custom ranges
4. Add range action

Responsibilities:

- Set startup default
- Create and edit custom ranges
- Control which custom ranges appear in the header
- Control visible custom shortcut order

## 5. Supported Range Types

### 5.1 Built-In Ranges

Built-in ranges remain unchanged:

- `today`
- `week`
- `month`
- `all`

These are system-defined, always available, and cannot be deleted.

### 5.2 Custom Relative Range

Relative ranges represent rolling windows such as "last 2 days".

Fields:

- `id`
- `label`
- `type = "relative"`
- `days`
- `includeToday`
- `showInHeader`
- `sortOrder`
- `createdAt`
- `updatedAt`

Examples:

- Last 2 Days
- Last 14 Days
- Last 90 Days

### 5.3 Custom Absolute Range

Absolute ranges represent fixed date intervals.

Fields:

- `id`
- `label`
- `type = "absolute"`
- `startDate`
- `endDate`
- `showInHeader`
- `sortOrder`
- `createdAt`
- `updatedAt`

Examples:

- 2026-03-01 to 2026-03-15
- Billing Cycle
- Sprint 7

## 6. Unified Range Model

The app should stop treating the active range as only a simple enum.

Recommended frontend shape:

```ts
type BuiltInTimeRangeKey = 'today' | 'week' | 'month' | 'all';

type CustomTimeRange =
  | {
      id: string;
      label: string;
      type: 'relative';
      days: number;
      includeToday: boolean;
      showInHeader: boolean;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    }
  | {
      id: string;
      label: string;
      type: 'absolute';
      startDate: string;
      endDate: string;
      showInHeader: boolean;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    };

type ActiveTimeRange =
  | { kind: 'built_in'; key: BuiltInTimeRangeKey }
  | { kind: 'custom'; id: string }
  | {
      kind: 'ad_hoc';
      startDate: string;
      endDate: string;
    };
```

Key decisions:

- Built-in ranges stay explicit
- Saved custom ranges are referenced by ID
- One-off custom queries are represented as ad hoc ranges

## 7. Header Interaction Design

### 7.1 Visual Structure

The existing built-in segmented control style should remain the primary pattern.

Recommended hierarchy:

- Built-in range buttons use the current segmented visual style
- Visible custom shortcuts use the same height and radius, but slightly weaker emphasis when inactive
- `More` uses the same height as the segmented buttons so it feels native to the toolbar

### 7.2 Visible Shortcut Rules

- Show up to 2 custom ranges directly in the header
- Order by `sortOrder`
- If the app window becomes narrow, reduce visible custom shortcuts from 2 to 1
- In the narrowest supported state, keep built-ins and `More`, and drop direct custom shortcut visibility

### 7.3 Why Overflow Beats Horizontal Scrolling

Overflow is preferred over horizontal scrolling because:

- The header is a tool navigation area, not content
- Hidden ranges inside a scroll strip are harder to discover
- Selected state becomes unclear when the active item is off-screen
- The current product aesthetic is compact and controlled rather than exploratory

### 7.4 More Menu Structure

`More` opens a dark popup menu with three sections:

1. Custom ranges
2. `Custom Range...`
3. `Manage Ranges`

Menu behavior:

- Show all saved custom ranges
- Highlight the currently active custom range
- Allow selection of any saved custom range
- Keep `Custom Range...` separate from saved shortcuts
- Route `Manage Ranges` to the settings page section

### 7.5 Selection State Rules

If the active range is a built-in range:

- Highlight the selected built-in button
- Keep custom shortcuts and `More` inactive

If the active range is a visible custom shortcut:

- Highlight that custom shortcut button

If the active range is a hidden custom shortcut selected from `More`:

- Highlight `More`
- Show an active label summary if space allows

Examples:

- `More: Sprint`
- `More: Mar 1-15`

This preserves state visibility even when the active range is not directly visible in the toolbar.

## 8. Ad Hoc Custom Range Query

`Custom Range...` inside `More` supports one-off range selection.

Flow:

1. User opens `More`
2. User selects `Custom Range...`
3. A lightweight modal or popup asks for `startDate` and `endDate`
4. On confirm, the dashboard immediately refreshes using that range

Important behavior:

- The query is active for the current session
- It is not auto-saved as a shortcut
- A follow-up action may allow `Save as Shortcut`

Reasoning:

- Temporary queries are common
- Auto-saving every query would clutter the saved range list
- Saved shortcuts should represent repeated user intent, not one-off exploration

## 9. Settings Page Design

### 9.1 Default Time Range

This remains at the top of the section.

The selector groups values into:

- Built-in
- Custom

Users may choose:

- `Today`
- `Week`
- `Month`
- `All`
- Any saved custom range

Fallback rule:

- If the current default custom range is deleted, fallback to `Today`

### 9.2 Header Shortcuts

This subsection manages which saved custom ranges appear directly in the header.

Each item should show:

- Label
- Range summary
- Order controls
- Edit action
- Remove from header action

This section only manages header visibility and order.

Empty state:

- "No header shortcuts yet. Add or pin a custom range below."

### 9.3 All Custom Ranges

Show all saved custom ranges in a card list consistent with the existing settings page style.

Each card includes:

- Label
- Type badge: `Last N Days` or `Fixed Dates`
- Range summary
- Header visibility state
- Default state
- Edit action
- Delete action

### 9.4 Add Range Interaction

Use a modal rather than a large inline form.

Step 1:

- Select range type
  - Relative
  - Absolute

Step 2:

- Fill type-specific fields
- Choose whether to pin to header
- Optionally set as default

## 10. Form Design

### 10.1 Relative Range Form

Fields:

- Label
- Number of days
- Include today
- Show in header
- Set as default

Rules:

- `days` must be a positive integer
- Suggested validation floor: `1`
- Suggested validation ceiling for V1: `3650`

If the user leaves the label empty, generate one automatically.

Examples:

- `Last 2 Days`
- `Last 30 Days`

### 10.2 Absolute Range Form

Fields:

- Label
- Start date
- End date
- Show in header
- Set as default

Rules:

- Start date must be on or before end date
- Both dates are required
- Store dates in stable machine format, display them in localized format

If the user leaves the label empty, generate a readable default label.

Example:

- `Mar 1 - Mar 15`

## 11. Limits And Ordering Rules

Recommended V1 limits:

- Maximum saved custom ranges: `12`
- Maximum visible header shortcuts: `2`

Ordering:

- Header-visible custom ranges sort by `sortOrder`
- Remaining menu items sort by:
  1. header-visible first
  2. then `sortOrder`
  3. then recent usage
  4. then creation time

Behavior when header shortcut capacity is already full:

- Allow users to save another custom range with `showInHeader = true`
- Show a non-blocking message that header capacity is full
- Ask users to manage visible order in the header shortcuts section

This avoids hard failure while keeping header rules predictable.

## 12. Data Flow

### 12.1 Settings Persistence

Persist:

- `defaultTimeRange`
- saved custom ranges
- header visibility
- header order

This data belongs in the settings store because it is user preference state.

### 12.2 Filter State

The active dashboard filter should consume the unified range model.

At startup:

1. Load settings
2. Resolve `defaultTimeRange`
3. Set active dashboard time range

At runtime:

- Header selection updates active filter state
- Ad hoc range selection updates active filter state only
- Saved range management updates settings state and may also update active filter state if the edited item is active

### 12.3 Backend Query Contract

The backend should stop assuming the query always maps to `today/week/month/all`.

Recommended request shape:

```ts
type StatisticsQueryTimeRange =
  | { kind: 'built_in'; key: 'today' | 'week' | 'month' | 'all' }
  | { kind: 'relative'; days: number; includeToday: boolean }
  | { kind: 'absolute'; startDate: string; endDate: string };
```

This keeps the dashboard flexible without requiring the UI to convert everything back into the old enum.

## 13. Edge Cases

### 13.1 Deleted Active Range

If the user deletes the currently active custom range:

- Switch active range to `Today`
- Show a lightweight toast

### 13.2 Deleted Default Range

If the deleted range is also the default:

- Reset default to `Today`
- Persist immediately

### 13.3 Invalid Edited Range

If a saved custom range becomes invalid during edit:

- Prevent save
- Show inline field error
- Keep the previous saved version unchanged

### 13.4 Empty Custom Range List

If no custom ranges exist:

- Header shows only built-ins and no active custom state
- `More` may still exist if it is also the entry point for ad hoc query

Recommended V1 behavior:

- Keep `More` visible so users always have access to `Custom Range...`

### 13.5 Narrow Window

If the toolbar width is constrained:

- Preserve built-ins first
- Preserve `More` second
- Hide direct custom shortcut visibility before degrading built-ins

## 14. Accessibility And UX Notes

- All toolbar buttons require visible active states
- `More` must expose active state when the active range is hidden in overflow
- Modal inputs require labels and inline validation
- Date pickers must remain keyboard accessible
- Icon-only affordances require labels or accessible names
- Button hit areas should remain comfortably clickable in a desktop window
- Color must not be the only signal for active or default state

## 15. Testing Strategy

### 15.1 Unit Tests

Frontend:

- resolve default range from built-in and custom values
- derive header-visible custom shortcuts from settings
- derive overflow list from visible list
- handle fallback when active or default custom range is deleted
- validate relative and absolute form payloads

Backend:

- map built-in, relative, and absolute range payloads into query filters
- validate inclusive date boundary behavior
- validate relative day calculations

### 15.2 Component Tests

- render built-ins plus visible custom shortcuts
- render active state for visible custom shortcut
- render active state on `More` when selected shortcut is hidden
- open `More` and select a saved custom shortcut
- open `Custom Range...` and submit an ad hoc query
- render settings lists and form validation states

### 15.3 Integration Tests

- startup respects default custom range
- editing header visibility changes header rendering
- deleting a default custom range falls back to `Today`
- deleting an active custom range falls back to `Today`
- selecting an ad hoc range refreshes the dashboard without saving a shortcut

## 16. Recommended V1 Scope

Ship in V1:

- Built-ins remain unchanged
- Custom relative ranges
- Custom absolute ranges
- Default range can reference built-in or saved custom range
- Header shows up to 2 custom shortcuts
- `More` menu supports all saved ranges
- `Custom Range...` supports ad hoc query
- Settings page supports create, edit, delete, pin to header, and ordering

Defer if needed:

- Drag-and-drop ordering
- Range duplication
- Preset recommendations
- Analytics on range usage frequency

## 17. Acceptance Criteria

- Users can save both relative and absolute custom ranges
- Users can set a saved custom range as the startup default
- Dashboard header keeps built-ins always visible
- Dashboard header shows at most 2 custom shortcuts directly
- Overflow ranges remain discoverable through `More`
- Temporary date range queries do not auto-save
- Deleting an active or default custom range falls back safely to `Today`
- Header remains visually compact and does not require horizontal scrolling
