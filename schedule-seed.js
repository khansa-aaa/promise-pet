// Starting rows for the Schedule tab. Only used the first time the app runs without a saved schedule;
// after that promises.json is the source. Add your own rows here if you want the table pre-filled, e.g.
//   { date: '2026-11-23', module: 'MATH101', what: 'Final exam', time: '9–11am', venue: 'Hall A', notes: '' }
// date is YYYY-MM-DD, or '' when the date is not announced yet (those rows sort last).
module.exports = [];
