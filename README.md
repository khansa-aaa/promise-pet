# Promise Pet (dark dragon)

A little dragon that lives on top of every window on your screen and keeps you to your daily promises.

## Run it

1. Install Node.js (https://nodejs.org), v18 or newer.
2. In this folder:

   ```
   npm install
   npm start
   ```

The dragon appears in the bottom-right corner of your main screen, with a bubble asking what you promise today.

## Using it

Click the dragon to open the promise bubble (click it again to close it).

- **Add:** type in the "I promise to…" box and press Enter (or click Add).
- **Mark done:** click a promise or its checkbox. Click again to undo.
- **Edit:** double-click a promise, or hover over it and click the pencil. Enter saves, Esc cancels.
- **Remove:** hover over a promise and click the ✕.
- **Move the dragon:** drag it anywhere; its position is remembered.

## Backlog (startup to-dos, no dates)

The bubble has two tabs: **Today** (your daily promises) and **Backlog**. The backlog is for things you need to do but have no deadline for. It never resets at midnight, and the dragon never nags you about it.

- **Add:** open the Backlog tab, type, press Enter.
- **Tick off:** click an item. Done items drop to the bottom; "Clear done" removes them.
- **Edit:** double-click an item, or click the pencil.
- **Make it a promise for today:** hover an item and click the → arrow. It moves into Today's list.
- **Remove:** hover and click the ✕.
- The Backlog tab shows how many items are still open.

## Schedule (exams, tests, deadlines)

The third tab, **Schedule**, opens a big table (the bubble grows to fill the space above and left of the dragon; Today and Backlog stay small). It starts empty; add your exams, quizzes, tests and deadlines.

- **Edit:** click any cell and type. Enter saves (Shift+Enter for a new line in a cell), Esc cancels.
- **Date:** pick a date; the row shows the weekday and a countdown. Rows sort by date when you click out of the table; rows with no date (TBA) go last.
- Rows are colour-coded by how close they are: **light red** within 3 days, **yellow** within a week, **green** further out. Undated (TBA) rows stay uncoloured; past rows fade. Tick **Hide past** to hide them.
- **Add:** "+ Add row". **Delete:** click ✕, then "Sure?" to confirm.
- The dragon won't nag or switch tabs while the schedule is open.

To pre-fill the table, put rows in `schedule-seed.js`; it's only used the first time, after that your edits are saved in `promises.json`.

## What the dragon does

- No promises today? It asks, and asks again every 30 minutes until you answer. If you left something unfinished yesterday, it offers to carry it over.
- Pending promises? A badge shows how many are left, and every 45 minutes it puffs smoke and opens the bubble.
- All promises kept? It dances with confetti.
- Each day starts fresh at midnight.
- It sleeps between 11pm and 6am and stops nagging.

The tray / menu bar icon lets you hide or show the dragon, open promises, reset its position, launch at login, open developer tools (for debugging), or quit. Right-clicking the dragon gives a menu to hide it for 30 minutes or quit. It comes back by itself after 30 minutes, or sooner from the tray icon (click it, or choose "Show pet").

## If something doesn't work

Run `npm start` from a terminal and look for red error text. You can also open the tray menu, choose "Developer tools (debug)", and check the Console tab.

Your data is saved locally in a small `promises.json` in the app's user-data folder (kept for 60 days).

Reminder timings are constants at the top of `renderer.js`.

## License

MIT
