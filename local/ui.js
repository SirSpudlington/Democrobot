const { ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require("discord.js")
const { getPeriod, time2 } = require("./utils")
const { Times } = require('../config.json');

const apply = new ButtonBuilder()
    .setCustomId('apply')
    .setLabel('Apply to be a candidate')
    .setStyle(ButtonStyle.Primary);

const create_vote = new ButtonBuilder()
    .setCustomId('create_vote')
    .setLabel('Create a proposal')
    .setStyle(ButtonStyle.Secondary);

const vote = new ButtonBuilder()
    .setCustomId('vote')
    .setLabel('Vote for a candiate')
    .setStyle(ButtonStyle.Success);

const power = new ButtonBuilder()
    .setCustomId('action_of_power')
    .setLabel('Perform jurisdictional action')
    .setStyle(ButtonStyle.Danger);


const ControlPanel = new ActionRowBuilder().addComponents(vote, apply, create_vote);

const select = new StringSelectMenuBuilder()
    .setCustomId('apply-menu')
    .setPlaceholder('Role Application')
    .addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel('President')
            .setDescription('The Leader of this discord server, second place is assigned vice president.')
            .setValue('president'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Voters Commitee')
            .setDescription('The decision makers, 4 that are responsible for 40% of all voting power.')
            .setValue('votersCommitee'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Lead Admin')
            .setDescription('The lead admin is responsible for keeping order in the system.')
            .setValue('leadAdmin'),
    );

const CandidateTypes = new ActionRowBuilder().addComponents(select);

function VotingMenu(Presidents, LeadAdmin, VotersCommitee) {

    let presidents = Presidents.map(p => new StringSelectMenuOptionBuilder({
        label: p.name,
        value: p.id,
    }))

    let leadAdmin = LeadAdmin.map(p => new StringSelectMenuOptionBuilder({
        label: p.name,
        value: p.id,
    }))

    let votersCommitee = VotersCommitee.map(p => new StringSelectMenuOptionBuilder({
        label: p.name,
        value: p.id,
    }))

    let select_president = new StringSelectMenuBuilder()
        .setCustomId('vote-menu-president')
        .setPlaceholder('Select a candidate for president')
        .addOptions(
            presidents
        );
    
    let select_leadAdmin = new StringSelectMenuBuilder()
        .setCustomId('vote-menu-leadAdmin')
        .setPlaceholder('Select a candidate for lead admin')
        .addOptions(
            leadAdmin
        );

    let select_votersCommitee = new StringSelectMenuBuilder()
        .setCustomId('vote-menu-votersCommitee')
        .setPlaceholder('Select a candidate for voters commitee')
        .addOptions(
            votersCommitee
        );

    let actionRow1 = new ActionRowBuilder().addComponents(select_president);
    let actionRow2 = new ActionRowBuilder().addComponents(select_leadAdmin);
    let actionRow3 = new ActionRowBuilder().addComponents(select_votersCommitee);

    let info = new EmbedBuilder()
        .setTitle('Voting Info')
        .setColor(0x0099FF)
        .setTimestamp()
        .setDescription('Please read this info before you vote.')
        .addFields(
            { name: '#1 Changing Votes', value: 'Once your vote has been cast you cannot change it.' },
            { name: '#2 Voting On Click', value: 'Once you click on a candidate your vote has been cast.' },
        )

    return [info, actionRow1, actionRow2, actionRow3];
}

function GenericVoteMenu(supermajority, type, reason, user) {

    let extra = ""

    switch (type) {
        case "Generic":
            extra = "Please vote on this proposal."
        case "Kick":
            extra = "This vote is to kick " + user + " from the server."
        case "Ban":
            extra = "This vote is to ban " + user + " from the server."
        case "Demote":
            extra = "This vote is to demote " + user + "."
    }


    // create embed
    let menu = new EmbedBuilder()
        .setTitle(reason)
        .setColor(0x0099FF)
        .setTimestamp()
        .setDescription('Please vote on this proposal.')
        .addFields(
            { name: extra, value: "" },
        )
}

function InfoPanel(president, leadAdmin, votersCommitee, vice) {
    let x = getPeriod();
    let period = x[0];

    if (period === "Application") {
        period = "Accepting Candidate Applications"
    } else if (period === "Voting") {
        period = "Voting"
    } else {
        period = "Running Smoothly"
    }

    const TotalTime = Times.ApplicationTime + Times.CandidateTime + Times.CandidateTime;

    let current_period = Math.floor((new Date().getTime() - (Times.StartTimestamp * 1000)) / TotalTime)
    let current_time = (current_period * TotalTime) + (Times.StartTimestamp * 1000)

    let info = new EmbedBuilder()
        .setTitle('Current Stats')
        .setColor(0x0099FF)
        .setTimestamp()
        .setDescription('Current server stats.')
        .addFields(
            { name: 'The server status is currently', value: period },
            { name: 'The next term will start in', value: time2([current_time + Times.ApplicationTime + Times.VotingTime + Times.CandidateTime], "R")},
        );

    if (period == "Accepting Candidate Applications") {
        info.addFields(
            { name: 'Voting starts in', value: time2([current_time + Times.ApplicationTime], "R")},
        )
    } else if (period == "Voting") {
        info.addFields(
            { name: 'Voting ends in', value: time2([current_time + Times.ApplicationTime + Times.VotingTime], "R")},
        )
    }

    info.addFields(
        { name: 'President: ', value: `<@${president}>` },
        { name: 'Vice President: ', value: `<@${vice}>` },
        { name: 'Lead Admin: ', value: `<@${leadAdmin}>` },
    )

    return info;
}

module.exports = { ControlPanel, CandidateTypes, VotingMenu, InfoPanel};