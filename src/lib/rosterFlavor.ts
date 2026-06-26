export interface EmptyDayMessage {
   icon: string;
   title: string;
   detail: string;
}

export interface EmptyWeekMessage {
   icon: string;
   title: string;
   detail: string;
}

const EMPTY_TODAY_MESSAGES = [
   {
      icon: "fa-solid fa-prescription-bottle-medical",
      title: "No classes planned today.",
      detail: "Take a chill pill.",
   },
   {
      icon: "fa-regular fa-face-smile",
      title: "Nothing to see here.",
      detail: "Looks like you got the day off.",
   },
   {
      icon: "fa-regular fa-circle-check",
      title: "All clear right now.",
      detail: "You don't have anything on the calendar today.",
   },
   {
      icon: "fa-solid fa-magnifying-glass",
      title: "Whats this? Nothing.",
      detail: "A suspiciously peaceful day.",
   },
   {
      icon: "fa-solid fa-bolt",
      title: "Zero classes found today.",
      detail: "Use this power irresponsibly.",
   },
   {
      icon: "fa-solid fa-bed",
      title: "Sleep in, it's a free day.",
      detail: "0 classes today. Maybe catch up on some rest?",
   },
   {
      icon: "fa-regular fa-eraser",
      title: "A blank day.",
      detail: "Nothing scheduled for today. A clean slate to fill as you wish.",
   },
   {
      icon: "fa-solid fa-couch",
      title: "Relax, no classes today.",
      detail: "Enjoy the break and maybe do something fun!",
   },
   {
      icon: "fa-solid fa-coffee",
      title: "No lessons today.",
      detail: "Kick up your feet and enjoy the free time.",
   },
   {
      icon: "fa-regular fa-clock",
      title: "All set for today.",
      detail: "You can clock out already. You have no classes scheduled right now.",
   }
] as const satisfies readonly EmptyDayMessage[];

const EMPTY_DAY_MESSAGE = "No classes scheduled.";

const EMPTY_WEEK_MESSAGES = [
   {
      icon: "fa-regular fa-face-grin-stars",
      title: "Sugoi!!!",
      detail: "The whole week is wide open.",
   },
   {
      icon: "fa-solid fa-umbrella-beach",
      title: "Calendar vacation mode.",
      detail: "Nothing for this week. Either you're free, or your schedule is shy.",
   },
   {
      icon: "fa-regular fa-calendar-check",
      title: "Blank week. Beautiful.",
      detail: "Enjoy the rare moment where the roster has nothing to say.",
   },
   {
      icon: "fa-solid fa-mug-saucer",
      title: "No lessons found.",
      detail: "This week appears to be powered entirely by breaks.",
   },
   {
      icon: "fa-regular fa-calendar",
      title: "Nothing scheduled this week.",
      detail: "The roster is empty, spend this time wisely.",
   },
   {
      icon: "fa-solid fa-door-open",
      title: "Week cleared.",
      detail: "No classes are listed here. Maybe try touching some grass?",
   },
   {
      icon: "fa-regular fa-clock",
      title: "Plans are all empty.",
      detail: "There are no classes scheduled this week. Time to relax or catch up on work!",
   },
   {
      icon: "fa-solid fa-check",
      title: "Schedule empty.",
      detail: "Looks like you're all done already.",
   },
   {
      icon: "fa-regular fa-compass",
      title: "Nothing on the map.",
      detail: "No rooms, teachers, or time slots are attached to this week.",
   },
   {
      icon: "fa-solid fa-moon",
      title: "A quiet week.",
      detail: "No classes are scheduled. Your schedule is taking it easy.",
   },
] as const satisfies readonly EmptyWeekMessage[];

function getStableIndex(seed: string, length: number) {
   let hash = 0;

   for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
   }

   return hash % length;
}

function getPositiveModulo(value: number, divisor: number) {
   return ((value % divisor) + divisor) % divisor;
}

function getWeekIndex(weekStart: string) {
   const timestamp = Date.parse(`${weekStart}T12:00:00Z`);
   return Math.floor(timestamp / (7 * 24 * 60 * 60 * 1000));
}

function getShuffledWeekMessageIndexes(cycleIndex: number) {
   return EMPTY_WEEK_MESSAGES.map((_, index) => index).sort((leftIndex, rightIndex) => {
      return getStableIndex(`${cycleIndex}:${leftIndex}`, 1_000_000) - getStableIndex(`${cycleIndex}:${rightIndex}`, 1_000_000);
   });
}

function getWeekMessageIndex(weekStart: string) {
   const messageCount = EMPTY_WEEK_MESSAGES.length;
   const weekIndex = getWeekIndex(weekStart);
   const cycleIndex = Math.floor(weekIndex / messageCount);
   const weekPosition = getPositiveModulo(weekIndex, messageCount);
   const indexes = getShuffledWeekMessageIndexes(cycleIndex);
   const previousIndexes = getShuffledWeekMessageIndexes(cycleIndex - 1);
   const previousCycleLastIndex = previousIndexes[messageCount - 1] ?? 0;
   const currentCycleFirstIndex = indexes[0] ?? 0;

   if (currentCycleFirstIndex === previousCycleLastIndex) {
      indexes.push(indexes.shift() ?? 0);
   }

   return indexes[weekPosition] ?? 0;
}

export function getEmptyTodayMessage(dayKey: string): EmptyDayMessage {
   return EMPTY_TODAY_MESSAGES[getStableIndex(dayKey, EMPTY_TODAY_MESSAGES.length)] ?? EMPTY_TODAY_MESSAGES[0];
}

export function getEmptyDayMessage(): string {
   return EMPTY_DAY_MESSAGE;
}

export function getEmptyWeekMessage(weekStart: string): EmptyWeekMessage {
   return EMPTY_WEEK_MESSAGES[getWeekMessageIndex(weekStart)] ?? EMPTY_WEEK_MESSAGES[0];
}

export function getBreakIcon(previousLessonEnd: Date, nextLessonStart: Date, lessonIndex: number): string {
   const breakMinutes = Math.round((nextLessonStart.getTime() - previousLessonEnd.getTime()) / 60_000);

   if (breakMinutes >= 90) {
      return "fa-solid fa-utensils";
   }

   if (breakMinutes >= 45) {
      return "fa-solid fa-mug-saucer";
   }

   if (lessonIndex <= 1) {
      return "fa-solid fa-sun";
   }

   if (breakMinutes <= 10) {
      return "fa-solid fa-person-running";
   }

   return "fa-solid fa-cookie-bite";
}
