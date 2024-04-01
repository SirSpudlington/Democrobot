const { time } = require("discord.js")
const { Times } = require('../config.json');

function time2(timestamp, mode) {
    if (typeof(timestamp) != "number") {
        date = new Date(timestamp[0]);
    }
    return time(date, mode);
}

function getPeriod() {
    let now = new Date();
    let start = Times.StartTimestamp
    let time_since_start = now.getTime() - (start * 1000);
    let localised_term = time_since_start % (Times.AppicationTime + Times.CandidateTime + Times.CandidateTime);
    if (localised_term < Times.AppicationTime) {
        return ["Application", (start*1000) + (time_since_start - localised_term) + Times.AppicationTime + Times.CandidateTime + Times.CandidateTime];
    } else if ((localised_term - Times.AppicationTime) < Times.VotingTime) {
        return ["Voting", (start*1000) + (time_since_start - localised_term) + Times.AppicationTime + Times.CandidateTime + Times.CandidateTime];
    } else {
        return ["Candidate", (start*1000) + (time_since_start - localised_term) + Times.AppicationTime + Times.CandidateTime + Times.CandidateTime];
    }
}


module.exports = {
    time2: time2,
    getPeriod: getPeriod,
}