const { time } = require("discord.js")
const { Times } = require('../config.json');

function time2(timestamp, mode) {
    if (typeof(timestamp) != "number") {
        date = new Date(timestamp[0]);
    }
    return time(date, mode);
}

const TotalTime = Times.ApplicationTime + Times.VotingTime + Times.CandidateTime;

function getPeriod() {
    let now = new Date();
    let start = Times.StartTimestamp
    let time_since_start = now.getTime() - (start * 1000);
    let localised_term = time_since_start % TotalTime;
    if (localised_term < Times.ApplicationTime) {
        return ["Application", (start*1000) + (time_since_start - localised_term) + TotalTime];
    } else if ((localised_term - Times.ApplicationTime) < Times.VotingTime) {
        return ["Voting", (start*1000) + (time_since_start - localised_term) + TotalTime];
    } else {
        return ["Candidate", (start*1000) + (time_since_start - localised_term) + TotalTime];
    }
}

module.exports = {
    time2: time2,
    getPeriod: getPeriod
}