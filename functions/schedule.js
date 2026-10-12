const TIME_ZONE = 'America/Costa_Rica';
const SPANISH_DAYS = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo'
};

function getLocalScheduleParts(date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    day: SPANISH_DAYS[values.weekday.toLowerCase()],
    date: `${values.year}-${values.month}-${values.day}`,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute)
  };
}

function getStartMinute(scheduleTime) {
  const match = String(scheduleTime || '').match(/^\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function isWithinReminderWindow(minuteOfDay, startMinute, windowMinutes = 9) {
  const minutesAfterStart = minuteOfDay - startMinute;
  return minutesAfterStart >= 0 && minutesAfterStart <= windowMinutes;
}

function getActiveScheduleEntries(schedules, day, minuteOfDay) {
  return schedules.flatMap(({ diaconiaId, data }) => {
    if (!Array.isArray(data.days) || !data.days.includes(day) || !Array.isArray(data.times)) return [];

    return data.times
      .filter(scheduleTime => {
        const startMinute = getStartMinute(scheduleTime);
        return startMinute !== null && isWithinReminderWindow(minuteOfDay, startMinute);
      })
      .map(scheduleTime => ({ diaconiaId, scheduleTime }));
  });
}

function getEligibleGroups(groups, day, activeSchedules) {
  const activeTimesByDiaconia = new Map();
  activeSchedules.forEach(({ diaconiaId, scheduleTime }) => {
    if (!activeTimesByDiaconia.has(diaconiaId)) activeTimesByDiaconia.set(diaconiaId, new Set());
    activeTimesByDiaconia.get(diaconiaId).add(scheduleTime);
  });

  return groups.filter(group =>
    group.scheduleDay === day
    && activeTimesByDiaconia.get(group.diaconiaId)?.has(group.scheduleTime)
  );
}

function filterUnsentRecipients(recipients, sentTokens) {
  const sent = new Set(sentTokens);
  return recipients.filter(({ token }) => !sent.has(token));
}

module.exports = {
  filterUnsentRecipients,
  getActiveScheduleEntries,
  getEligibleGroups,
  getLocalScheduleParts,
  getStartMinute,
  isWithinReminderWindow
};
