import axios from 'axios';
import moment from 'moment';
import fs from 'fs';

const baseApiUrl = `https://gisat.teamwork.com`;

async function getUserDetails({ apiKey }) {
    const response = await axios({
        auth: {
            username: apiKey,
            password: `authByApiKey`
        },
        url: `${baseApiUrl}/me.json`
    })

    return response.data;
}

function getUserId({ userDetails }) {
    return userDetails.person.id;
}

function getTimeInterval({ month, year }) {
    let intervalMoment;
    if (year) {
        intervalMoment = moment().year(year);
    } else {
        intervalMoment = moment();
    }

    if (month) {
        return {
            from: intervalMoment.month(Number(month) - 1).startOf("month").format("YYYYMMDD"),
            to: intervalMoment.month(Number(month) - 1).endOf("month").format("YYYYMMDD")
        }
    } else {
        return {
            from: intervalMoment.subtract(1, "month").startOf("month").format("YYYYMMDD"),
            to: intervalMoment.subtract(1, "month").endOf("month").format("YYYYMMDD")
        }
    }
}

async function getLoggedTime({ apiKey, userId, timeInterval, page = 0, entries = [] }) {
    const response = await axios({
        auth: {
            username: apiKey,
            password: `authByApiKey`
        },
        url: `${baseApiUrl}/time_entries.json`,
        params: {
            userId,
            fromDate: timeInterval.from,
            toDate: timeInterval.to,
            page
        }
    });

    const currentPage = Number(response.headers['x-page']);
    const totalPages = Number(response.headers['x-pages']);

    entries = entries.concat(response.data['time-entries']);

    if (currentPage < totalPages) {
        return await getLoggedTime({ apiKey, userId, timeInterval, page: currentPage + 1, entries })
    } else {
        return entries;
    }
}

async function getTotals({ loggedTime, timeInterval }) {
    if (!loggedTime.length) {
        throw new Error("No logged time");
    }

    const totals = {
        days: {},
        summary: {},
        user: `${loggedTime[0]['person-first-name']} ${loggedTime[0]['person-last-name']}`,
        total: 0,
        from: timeInterval.from,
        to: timeInterval.to
    };

    for (const entry of loggedTime) {
        const project = entry['project-name'];
        const task = `${entry.parentTaskName ? `${entry.parentTaskName} >> ` : ``}${entry['todo-item-name']}`;
        const time = Number(entry.hoursDecimal);

        if (!totals.summary[project]) {
            totals.summary[project] = {
                tasks: {
                    [task]: 0
                },
                total: 0
            }
        }

        if (!totals.summary[project].tasks[task]) {
            totals.summary[project].tasks[task] = 0;
        }

        const day = moment(entry.dateUserPerspective).format("DD.MM. - dddd");

        if (!totals.days[day]) {
            totals.days[day] = {
                ...totals.days[day],
                projects: {
                    [project]: {
                        tasks: {
                            [task]: 0
                        },
                        total: 0
                    }
                },
                total: 0
            }
        }

        if (!totals.days[day].projects[project]) {
            totals.days[day].projects[project] = {
                tasks: {
                    [task]: 0
                },
                total: 0
            }
        }

        if (!totals.days[day].projects[project].tasks[task]) {
            totals.days[day].projects[project].tasks[task] = 0
        }

        totals.summary[project].tasks[task] += time;
        totals.summary[project].total += time;
        totals.days[day].projects[project].tasks[task] += time;
        totals.days[day].projects[project].total += time;
        totals.days[day].total += time;
        totals.total += time;
    }

    return totals;
}

async function exportTotals({ timeInterval, totals }) {
    const totalsStr = JSON.stringify(totals, null, 2);
    fs.writeFileSync(`TeamWork_Time_${timeInterval.from}_${timeInterval.to}.json`, totalsStr);
    console.log(totalsStr);
}

async function run({ apiKey, month, year }) {
    const userDetails = await getUserDetails({ apiKey });
    const userId = getUserId({ userDetails });
    const timeInterval = getTimeInterval({ month, year });
    const loggedTime = await getLoggedTime({ apiKey, userId, timeInterval });
    const totals = await getTotals({ loggedTime, timeInterval });

    await exportTotals({ timeInterval, totals });
}

async function init() {
    try {
        const [apiKey, month, year] = process.argv.slice(2);
        if (apiKey) {
            await run({ apiKey, month, year });
        } else {
            throw new Error(`Missing API Key!`);
        }
    } catch (e) {
        console.log(e);
    }
}

init();