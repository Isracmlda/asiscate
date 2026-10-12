const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterUnsentRecipients,
  getActiveScheduleEntries,
  getEligibleGroups,
  getLocalScheduleParts,
  getStartMinute,
  isWithinReminderWindow
} = require('./schedule');

test('converts UTC instants to Costa Rica group day and time', () => {
  assert.deepEqual(
    getLocalScheduleParts(new Date('2026-10-12T14:00:00.000Z')),
    { day: 'Lunes', date: '2026-10-12', minuteOfDay: 480 }
  );
});

test('reads the start of supported group time ranges', () => {
  assert.equal(getStartMinute('08:00-10:00'), 480);
  assert.equal(getStartMinute('8:05-10:00'), 485);
  assert.equal(getStartMinute('24:00-25:00'), null);
  assert.equal(getStartMinute('sin horario'), null);
});

test('accepts the scheduled minute and GitHub Actions scheduler delays', () => {
  assert.equal(isWithinReminderWindow(480, 480), true);
  assert.equal(isWithinReminderWindow(489, 480), true);
  assert.equal(isWithinReminderWindow(490, 480), false);
  assert.equal(isWithinReminderWindow(479, 480), false);
});

test('activates only maintenance schedules matching the current day and start window', () => {
  const schedules = [
    { diaconiaId: 'active', data: { days: ['Sábado'], times: ['08:00-10:00', '10:30-12:30'] } },
    { diaconiaId: 'other-day', data: { days: ['Domingo'], times: ['08:00-10:00'] } },
    { diaconiaId: 'removed-time', data: { days: ['Sábado'], times: ['10:30-12:30'] } }
  ];

  assert.deepEqual(getActiveScheduleEntries(schedules, 'Sábado', 484), [
    { diaconiaId: 'active', scheduleTime: '08:00-10:00' }
  ]);
});

test('filters groups to the matching diaconia, active day, and maintenance time', () => {
  const activeSchedules = [{ diaconiaId: 'active', scheduleTime: '08:00-10:00' }];
  const groups = [
    { id: 'valid', diaconiaId: 'active', scheduleDay: 'Sábado', scheduleTime: '08:00-10:00' },
    { id: 'disabled-time', diaconiaId: 'active', scheduleDay: 'Sábado', scheduleTime: '10:30-12:30' },
    { id: 'disabled-day', diaconiaId: 'active', scheduleDay: 'Domingo', scheduleTime: '08:00-10:00' },
    { id: 'other-diaconia', diaconiaId: 'other', scheduleDay: 'Sábado', scheduleTime: '08:00-10:00' }
  ];

  assert.deepEqual(getEligibleGroups(groups, 'Sábado', activeSchedules), [groups[0]]);
});

test('removes recipients whose device token was already notified', () => {
  const recipients = [{ token: 'token-a' }, { token: 'token-b' }];
  assert.deepEqual(filterUnsentRecipients(recipients, ['token-a']), [{ token: 'token-b' }]);
});
