const { time } = require("discord.js")
const { Times } = require('../config.json');

function time2(timestamp, mode) {
    if (typeof(timestamp) != "number") {
        date = new Date(timestamp[0]);
    }
    return time(date, mode);
}

const TotalTime = Times.AppicationTime + Times.CandidateTime + Times.CandidateTime;

// function getPeriod() {
//     let now = new Date();
//     let start = Times.StartTimestamp
//     let time_since_start = now.getTime() - (start * 1000);
//     let localised_term = time_since_start % TotalTime;
//     if (localised_term < Times.AppicationTime) {
//         return ["Application", (start*1000) + (time_since_start - localised_term) + TotalTime];
//     } else if ((localised_term - Times.AppicationTime) < Times.VotingTime) {
//         return ["Voting", (start*1000) + (time_since_start - localised_term) + TotalTime];
//     } else {
//         return ["Candidate", (start*1000) + (time_since_start - localised_term) + TotalTime];
//     }
// }

function getPeriod() {
    let now = new Date();
    let start = Times.StartTimestamp
    let current_time_in_period = now.getTime() % TotalTime;
    let current_period = Math.floor((now.getTime() - (start * 1000)) / TotalTime);
    let time_at_new = (current_period * (TotalTime + 1));

    if (current_time_in_period < Times.AppicationTime) {
        return ["Application", time_at_new];
    } else if ((current_time_in_period - Times.AppicationTime) < Times.VotingTime) {
        return ["Voting", time_at_new];
    } else {
        return ["Candidate", time_at_new];
    }
}


module.exports = {
    time2: time2,
    getPeriod: getPeriod,
}