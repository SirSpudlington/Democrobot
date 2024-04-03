const { Client, Events, GatewayIntentBits, AuditLogEvent, BitField, PermissionFlagsBits } = require('discord.js');

const { token, Server, Roles, Channels, InterfaceMessage, InfoMessage, BackupRoles } = require('./config.json');

const { ControlPanel, CandidateTypes, VotingMenu, InfoPanel } = require('./local/ui.js');
const { time2, getPeriod } = require('./local/utils.js');
const { db } = require('./local/db.js');
const {voting_init, process_vote, voting_pulse} = require('./local/voting.js');
const logger = require('./local/logger.js');


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration] });

var server
var builder_man_exists = false

/*

Each voting commitee member has 10% of voting power
The president has 10% of voting power

The president can veto proposals

*/

client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
    server = await client.guilds.cache.get(Server);
    logger.info("Performing Startup checks...")
    logger.info("Verify Server Existance [1/10]")
    if (!server) {
        logger.error("Server does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify Executive Role Existance [2/10]")
    if (!server.roles.cache.has(Roles.Executive)) {
        logger.error("Executive Role does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify Lead Admin Role Existance [3/10]")
    if (!server.roles.cache.has(Roles.LeadAdmin)) {
        logger.error("Lead Admin Role does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify Voting Commitee Role Existance [4/10]")
    if (!server.roles.cache.has(Roles.VotingCommitee)) {
        logger.error("Voting Commitee Role does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify President role Existance [5/10]")
    if (!server.roles.cache.has(Roles.President)) {
        logger.error("President Role does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify Vice President role Existance [6/10]")
    if (!server.roles.cache.has(Roles.VicePresident)) {
        logger.error("Vice President Role does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify Announcements Channel Existance [7/10]")
    if (!server.channels.cache.has(Channels.Announcements)) {
        logger.error("Announcements Channel does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Checking bot permissions [8/10]")
    logger.info("Verify Interface Channel Existance [9/10]")
    if (!server.channels.cache.has(Channels.Interface)) {
        logger.error("Interface Channel does not exist. Exiting...")
        process.exit(1);
    }
    logger.info("Verify Overview Channel Existance [10/10]")
    if (!server.channels.cache.has(Channels.Overview)) {
        logger.error("Overview Channel does not exist. Exiting...")
        process.exit(1);
    }

    if (server.roles.cache.has("1194047235491639297")) {
        builder_man_exists = true
        server.roles.edit('1194047235491639297', { position: server.roles.cache.size - 1 })
            .then(updated => logger.info(`Edited builderman role position to ${updated.position}`))
            .catch(logger.error);
    }

    logger.info("Startup checks complete.")

    voting_init(client, db)

    logger.info("Updating Control Panel")

    message = await (await server.channels.cache.get(Channels.Interface).messages.fetch(InterfaceMessage))
    message.edit({
        content: "",
        components: [ControlPanel],
    })

    logger.info("Updating Info Panel")

    let currentPres;
    try {
        currentPres = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM roles WHERE role = ?", ["president"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve(client.user.id)
                        return
                    }
                    resolve(row.user);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    let currentvPres;
    try {
        currentvPres = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM roles WHERE role = ?", ["vicepresident"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve(client.user.id)
                        return
                    }
                    resolve(row.user);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    let leadCurrent;
    try {
        leadCurrent = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM roles WHERE role = ?", ["leadAdmin"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve(client.user.id)
                        return
                    }
                    resolve(row.user);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    let vc;
    try {
        vc = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM roles WHERE role = ?", ["votersCommitee"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve([
                            client.user.id,
                            client.user.id,
                            client.user.id,
                            client.user.id
                        ])
                        return
                    }
                    resolve(row);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    vc = vc.map(p => p.user)


    message = await (await server.channels.cache.get(Channels.Overview)).messages.fetch(InfoMessage)
    message.edit({
        content: "",
        embeds: [InfoPanel(currentPres, leadCurrent, vc, currentvPres)],
    })

});

async function roleEvent(event) {
    if (role_updating) {
        return
    }

    protected = [Roles.Executive, Roles.LeadAdmin, Roles.President, Roles.VicePresident, Roles.VotingCommitee].map(async x => {
        let role = await server.roles.fetch(x)
        return role.id
    })

    if (event.permissions.has(PermissionFlagsBits.Administrator) || event.permissions.has(PermissionFlagsBits.BanMembers) || event.permissions.has(PermissionFlagsBits.KickMembers) || event.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await event.permissions.remove(PermissionFlagsBits.Administrator)
        await event.permissions.remove(PermissionFlagsBits.BanMembers)
        await event.permissions.remove(PermissionFlagsBits.KickMembers)
        await event.permissions.remove(PermissionFlagsBits.ManageGuild)
    }

    protected = await Promise.all(protected)

    if (protected.includes(event.id)) {
        // prevent duping

        let eventLogs = await server.fetchAuditLogs({
            type: AuditLogEvent.RoleUpdate,
            limit: 32,
        })

        let processed_audit_logs;
        try {
            processed_audit_logs = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM processed_audit_logs", (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            });
        } catch (error) {
            logger.error("Error querying the database:", error);
        }

        processed_audit_logs = 0

        let eventLog = eventLogs.entries.find(x => x.target.id === event.id && x.executor !== client.user && !(processed_audit_logs.id <= x.id))

        let name;

        if (eventLog == undefined) {
            name = "unknown"
        } else {
            // process_audit_logs
            db.exec(`INSERT INTO processed_audit_logs VALUES("${eventLog.id}")`)
            name = eventLog.executor.username
            role_updating = true
        }

        // check if any critical values are modified

        let total_roles = await server.roles.fetch();

        let pos = total_roles.size - 1

        let newest_role = total_roles.find(x => x.id == event.id);
        console.log(newest_role)

        if (builder_man_exists) {
            pos = pos - 1
        }

        let validpos = true;
        let validperm = true;
        let validunk = true;

        let rolesToCheck;

        if (newest_role.id == Roles.Executive) {
            if (newest_role.position != (pos - 4)) {
                validpos = false
            }

            rolesToCheck = BackupRoles.Executive
        } else if (newest_role.id == Roles.VicePresident) {
            if (newest_role.position != (pos - 3)) {
                validpos = false
            }

            rolesToCheck = BackupRoles.VicePresident
        } else if (newest_role.id == Roles.President) {
            if (newest_role.position != (pos - 2)) {
                validpos = false
            }

            rolesToCheck = BackupRoles.President
        } else if (newest_role.id == Roles.VotingCommitee) {
            if (newest_role.position != (pos - 1)) {
                validpos = false
            }
            rolesToCheck = BackupRoles.VotingCommitee
        } else if (newest_role.id == Roles.LeadAdmin) {
            if (newest_role.position != pos) {
                validpos = false
            }
            rolesToCheck = BackupRoles.LeadAdmin
        } else {
            return
        }

        for (const [key, value] of Object.entries(rolesToCheck)) {
            if (key == "permissions") {
                if (newest_role.permissions.bitfield != value) {
                    validperm = false
                    continue
                }
            }
            else if (key == "tags" || key == "reason" || key == "position") {
                continue
            }
            else if (newest_role[key] != value) {
                validunk = false
                continue
            }
        }

        console.log(validperm, validunk, validpos)

        if (validperm && validunk && validpos) {
            // no critical role alteration made
            return
        }

        // Name and shame

        client.channels.cache.get(Channels.Announcements).send({
            content: `A protected role "${event.name}" has been illegally updated by ${name}. Resetting functional roles.`,
        })

        // Update Lead Admin Role

        let updatev = BackupRoles.LeadAdmin
        updatev.position = pos
        updatev.reason = "Revert Protected Role"
        updatev.permissions = new BitField(updatev.permissions)
        await server.roles.edit(Roles.LeadAdmin, updatev)

        // Update Voting Commitee Role

        updatev = BackupRoles.VotingCommitee
        updatev.position = pos - 1
        updatev.reason = "Revert Protected Role"
        updatev.permissions = new BitField(updatev.permissions)
        await server.roles.edit(Roles.VotingCommitee, updatev)

        // Update President Role

        updatev = BackupRoles.President
        updatev.position = pos - 2
        updatev.reason = "Revert Protected Role"
        updatev.permissions = new BitField(updatev.permissions)
        await server.roles.edit(Roles.President, updatev)

        // Update Vice President Role

        updatev = BackupRoles.VicePresident
        updatev.position = pos - 3
        updatev.reason = "Revert Protected Role"
        updatev.permissions = new BitField(updatev.permissions)
        await server.roles.edit(Roles.VicePresident, updatev)

        // Update Executive Role

        updatev = BackupRoles.Executive
        updatev.position = pos - 4
        updatev.reason = "Revert Protected Role"
        updatev.permissions = new BitField(updatev.permissions)
        await server.roles.edit(Roles.Executive, updatev)

        // Demote User

        try {
            let user = await server.members.fetch(eventLog.executor.id)
            await user.roles.remove(Roles.LeadAdmin)
            await user.roles.remove(Roles.VotingCommitee)
            await user.roles.remove(Roles.President)
            await user.roles.remove(Roles.VicePresident)
            await user.roles.remove(Roles.Executive)

            db.run("DELETE FROM roles WHERE user = ?", [eventLog.executor.id.toString()]);

            await (new Promise((resolve, reject) => {
                setTimeout(() => {
                    resolve()
                }, 1000);
            }))

            role_updating = false;
        } catch (error) {
            logger.error("Error: " + error);
        }
    }
}

role_updating = false;

client.on(Events.GuildRoleUpdate, async (event) => {
    await roleEvent(event)
})

client.on(Events.GuildRoleDelete, async (event) => {
    await roleEvent(event)
})

async function verifyVote(interaction, vote_type) {
    let indb;
    try {
        indb = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM voted_${vote_type} WHERE user = ?`, [interaction.user.id.toString()], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    if (indb != undefined) {
        interaction.reply({ content: "You have already voted. Please wait for the next voting period.", ephemeral: true });
        return false;
    }

    let period = getPeriod();
    if (period[0] != "Voting") {
        interaction.reply({ content: "You cannot vote now, please wait until the voting period.", ephemeral: true });
        return false;
    }

    return true
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === "apply") {
            let [period, time_until_new] = getPeriod();
            if (period === "Voting") {
                interaction.reply({ content: `You cannot apply to be a candidate during a voting period.`, ephemeral: true });
                return;
            } else if (period === "Candidate") {
                interaction.reply({ content: `You cannot apply to be a candidate during a term.`, ephemeral: true });
                return;
            }

            interaction.reply({ content: "Please fill in the form, to become a candidate. You can only apply to one role and once picked, you cannot change it until the next voting period.", components: [CandidateTypes], ephemeral: true });
        } else if (interaction.customId === "vote") {
            let [period, time_until_new] = getPeriod();
            if (period === "Application") {
                interaction.reply({ content: `You cannot vote during the application period.`, ephemeral: true });
                return;
            } else if (period === "Candidate") {
                interaction.reply({ content: `You cannot apply to be a candidate during a term.`, ephemeral: true });
                return;
            }

            let candidates = await new Promise((resolve, reject) => {
                db.all("SELECT * FROM candidates", (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });

            let pres = candidates.filter(c => c.role === "president").map(async (c) => {
                let id = c.user;
                let username = (await client.users.fetch(id)).username;
                return { name: (username), id: (id) };
            })

            let lead = candidates.filter(c => c.role === "leadAdmin").map(async (c) => {
                let id = c.user;
                let username = (await client.users.fetch(id)).username;
                return { name: (username), id: (id) };
            })

            let voco = candidates.filter(c => c.role === "votersCommitee").map(async (c) => {
                let id = c.user;
                let username = (await client.users.fetch(id)).username;
                return { name: (username), id: (id) };
            })

            voco = await Promise.all(voco);
            pres = await Promise.all(pres);
            lead = await Promise.all(lead);

            voco.push({ name: "Abstain", id: "abstain" })
            pres.push({ name: "Abstain", id: "abstain" })
            lead.push({ name: "Abstain", id: "abstain" })

            let menu = VotingMenu(pres, lead, voco)

            await interaction.reply({ content: "Please select a candidate to vote for.", ephemeral: true, embeds: [menu[0]], components: menu.slice(1) });

        } else if (interaction.customId.startsWith("vote_")) {
            process_vote(interaction);
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "apply-menu") {
            let value = interaction.values[0]

            let period, time_until_new = getPeriod();
            if (period === "Voting") {
                interaction.reply({ content: `You cannot apply to be a candidate during a voting period.`, ephemeral: true });
                return;
            } else if (period === "Candidate") {
                interaction.reply({ content: `You cannot apply to be a candidate during a term.`, ephemeral: true });
                return;
            }

            let indb;
            try {
                indb = await new Promise((resolve, reject) => {
                    db.get("SELECT * FROM candidates WHERE user = ?", [interaction.user.id.toString()], (err, row) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(row);
                        }
                    });
                });
            } catch (error) {
                logger.error("Error querying the database:", error);
            }

            if (indb != undefined) {
                interaction.reply({ content: "You have already applied to a role. Please wait for the next voting period.", ephemeral: true });
                return;
            }

            if (value === "votersCommitee") {
                db.run("INSERT INTO candidates (user, role, votes) VALUES (?, ?, ?)", [interaction.user.id, "votersCommitee", 0]);
                interaction.reply({ content: "You have successfully applied to the Voters Commitee. You will appear in the voting pool shortly.", ephemeral: true });
                client.channels.cache.get(Channels.Announcements).send({ content: `<@${interaction.user.id}> has applied to be in the Voters Commitee.` });
            } else if (value === "leadAdmin") {
                db.run("INSERT INTO candidates (user, role, votes) VALUES (?, ?, ?)", [interaction.user.id, "leadAdmin", 0]);
                interaction.reply({ content: "You have successfully applied to the be the Lead Admin. You will appear in the voting pool shortly.", ephemeral: true });
                client.channels.cache.get(Channels.Announcements).send({ content: `<@${interaction.user.id}> has applied to be the Lead Admin.` });
            } else if (value === "president") {
                db.run("INSERT INTO candidates (user, role, votes) VALUES (?, ?, ?)", [interaction.user.id, "president", 0]);
                interaction.reply({ content: "You have successfully applied to the be the President. You will appear in the voting pool shortly.", ephemeral: true });
                client.channels.cache.get(Channels.Announcements).send({ content: `<@${interaction.user.id}> has applied to be the President.` });
            }

        } else if (interaction.customId === "vote-menu-president") {
            if (!await verifyVote(interaction, "pres")) { return; }
            let value = interaction.values[0]
            db.run("INSERT INTO voted_pres (user) VALUES (?)", [interaction.user.id]);
            db.run("UPDATE candidates SET votes = votes + 1 WHERE user = ?", [value]);
            interaction.reply({ content: "You have successfully voted for the President.", ephemeral: true });
        } else if (interaction.customId === "vote-menu-leadAdmin") {
            if (!await verifyVote(interaction, "lead")) { return; }
            let value = interaction.values[0]
            db.run("INSERT INTO voted_lead (user) VALUES (?)", [interaction.user.id]);
            db.run("UPDATE candidates SET votes = votes + 1 WHERE user = ?", [value]);
            interaction.reply({ content: "You have successfully voted for the Lead Admin.", ephemeral: true });
        } else if (interaction.customId === "vote-menu-votersCommitee") {
            if (!await verifyVote(interaction, "vote")) { return; }
            let value = interaction.values[0]
            db.run("INSERT INTO voted_vote (user) VALUES (?)", [interaction.user.id]);
            db.run("UPDATE candidates SET votes = votes + 1 WHERE user = ?", [value]);
            interaction.reply({ content: "You have successfully voted for the Voters Commitee.", ephemeral: true });
        }
    }
})

client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
    if (entry.executorId == client.user.id) { return }
    if (entry.action == AuditLogEvent.MemberRoleUpdate) {
        let modifed = []
        entry.changes.map(c => {
            for (let i = 0; i < c.new.length; i++) {
                modifed.push(c.new[i].id)
            }
        })
        if (modifed.includes(Roles.President) || modifed.includes(Roles.LeadAdmin) || modifed.includes(Roles.VotingCommitee) || modifed.includes(Roles.Executive) || modifed.includes(Roles.VicePresident)) {
            let member = await server.members.fetch(entry.targetId);
            let user = await client.users.fetch(member.user.id);
            client.channels.cache.get(Channels.Announcements).send({ content: `<@${user.id}> has had their role illegally updated by <@${entry.executorId}>. Resetting all roles, and demoting the offender.` });

            let execs = [...(await server.roles.fetch(Roles.Executive)).members.values()]
            let pres = [...(await server.roles.fetch(Roles.President)).members.values()]
            let lead = [...(await server.roles.fetch(Roles.LeadAdmin)).members.values()]
            let vote = [...(await server.roles.fetch(Roles.VotingCommitee)).members.values()]
            let vice = [...(await server.roles.fetch(Roles.VicePresident)).members.values()]

            for (let i = 0; i < execs.length; i++) {
                await execs[i].roles.remove(Roles.Executive)
            }
            for (let i = 0; i < pres.length; i++) {
                await pres[i].roles.remove(Roles.President)
            }
            for (let i = 0; i < lead.length; i++) {
                await lead[i].roles.remove(Roles.LeadAdmin)
            }
            for (let i = 0; i < vote.length; i++) {
                await vote[i].roles.remove(Roles.VotingCommitee)
            }
            for (let i = 0; i < vice.length; i++) {
                await vice[i].roles.remove(Roles.VicePresident)
            }

            let cans = await (new Promise((resolve, reject) => {
                db.all("SELECT * FROM roles WHERE user = ?", [entry.executorId], async (err, rows) => {
                    resolve(rows)
                })
            }))

            for (let i = 0; i < cans.length; i++) {
                let row = cans[i]
                if (row == undefined) {
                    return;
                }
                await (new Promise((resolve, reject) => {
                    db.run("INSERT INTO roles (user, role) VALUES (?, ?)", [client.user.id, row.role], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                }))
                await (new Promise((resolve, reject) => {
                    db.run("DELETE FROM roles WHERE user = ?", [entry.executorId], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                }))
            }

            let rows = await (new Promise((resolve, reject) => {
                db.all("SELECT * FROM roles", async (err, rows) => {
                    resolve(rows)
                })
            }))

            for (let i = 0; i < rows.length; i++) {
                let row = rows[i]
                if (row == undefined) {
                    return
                }
                let user = await server.members.fetch(row.user)
                if (row.role == "president") {
                    await user.roles.add(Roles.President)
                    await user.roles.add(Roles.Executive)
                }
                if (row.role == "leadAdmin") {
                    await user.roles.add(Roles.LeadAdmin)
                    await user.roles.add(Roles.Executive)
                }
                if (row.role == "votersCommitee") {
                    await user.roles.add(Roles.VotingCommitee)
                    await user.roles.add(Roles.Executive)
                }
                if (row.role == "vicepresident") {
                    await user.roles.add(Roles.VicePresident)
                    await user.roles.add(Roles.Executive)
                }
            }
        }
    }
})

setInterval(async () => {

    // process votes

    voting_pulse()

    // Admin stuff

    let period = getPeriod();

    let last;
    try {
        last = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM current", (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    if (last == undefined) {
        db.run("INSERT INTO current (period) VALUES (?)", [period[0]]);
    } else if (last.period != period[0]) {
        db.run("UPDATE current SET period = ?", [period[0], last.id]);
    } else {
        return
    }

    logger.debug("Updating Info Panel")

    let currentPres;
    try {
        currentPres = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM roles WHERE role = ?", ["president"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve(client.user.id)
                        return
                    }
                    resolve(row.user);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    let currentvPres;
    try {
        currentvPres = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM roles WHERE role = ?", ["vicepresident"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve(client.user.id)
                        return
                    }
                    resolve(row.user);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    let leadCurrent;
    try {
        leadCurrent = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM roles WHERE role = ?", ["leadAdmin"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve(client.user.id)
                        return
                    }
                    resolve(row.user);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    let vc;
    try {
        vc = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM roles WHERE role = ?", ["votersCommitee"], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row == undefined) {
                        resolve([
                            client.user.id,
                            client.user.id,
                            client.user.id,
                            client.user.id
                        ])
                        return
                    }
                    resolve(row);
                }
            });
        });
    } catch (error) {
        logger.error("Error querying the database:", error);
    }

    vc = vc.map(p => p.user)


    message = await (await server.channels.cache.get(Channels.Overview)).messages.fetch(InfoMessage)
    message.edit({
        content: "",
        embeds: [InfoPanel(currentPres, leadCurrent, vc, currentvPres)],
    })

    if (period[0] === "Voting") {
        client.channels.cache.get(Channels.Announcements).send({ content: `The voting station has opened, Vote away.` });
    } else if (period[0] === "Application") {
        client.channels.cache.get(Channels.Announcements).send({ content: `The application process is open, place your applications now.` });
    } else if (period[0] === "Candidate") {
        client.channels.cache.get(Channels.Announcements).send({ content: `Voting has ended.` });

        // Get all current roles

        let rolesCurrent = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM roles", (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        // Get all current candidates
        let candidates = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM candidates", (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        // Remove all current roles

        for (const role of rolesCurrent) {
            db.run("DELETE FROM roles WHERE user = ?", [role.user]);
            let guildUser = await server.members.fetch(role.user, { force: true });
            if (guildUser == undefined) { return; }
            await guildUser.roles.remove(Roles.Executive);
            await guildUser.roles.remove(Roles.VicePresident);
            await guildUser.roles.remove(Roles.VotingCommitee);
            await guildUser.roles.remove(Roles.LeadAdmin);
            await guildUser.roles.remove(Roles.President);
        }

        // delete voted users

        db.run("DELETE FROM voted_pres");
        db.run("DELETE FROM voted_vote");
        db.run("DELETE FROM voted_lead");

        db.run("DELETE FROM candidates");

        // Add new roles

        let leadAdmins = {};
        let presidents = {};
        let votersCommitees = {};

        candidates.forEach(async (candidate) => {
            if (candidate.role === "leadAdmin") {
                leadAdmins[candidate.user] = candidate.votes;
            } else if (candidate.role === "president") {
                presidents[candidate.user] = candidate.votes;
            } else if (candidate.role === "votersCommitee") {
                votersCommitees[candidate.user] = candidate.votes;
            }
        });

        let sel_pres;
        let sel_vp;
        let sel_lead;
        let sel_vote_1;
        let sel_vote_2;
        let sel_vote_3;
        let sel_vote_4;


        if (Object.keys(presidents).length > 0) {
            let max = 0;
            let max_user = undefined;
            let second_max = 0;
            let second_max_user = undefined;

            for (const [user, votes] of Object.entries(presidents)) {
                if (votes >= max) {
                    max = votes;
                    max_user = user;
                }
            }

            for (const [user, votes] of Object.entries(presidents)) {
                if (votes >= second_max && user != max_user) {
                    second_max = votes;
                    second_max_user = user;
                }
            }

            sel_pres = max_user;
            sel_vp = second_max_user;
        }

        if (Object.keys(leadAdmins).length > 0) {
            let max = 0;
            let max_user = undefined;

            for (const [user, votes] of Object.entries(leadAdmins)) {
                if (votes >= max) {
                    max = votes;
                    max_user = user;
                }
            }

            sel_lead = max_user;
        }

        if (Object.keys(votersCommitees).length > 0) {
            let max = [0, 0, 0, 0];
            let max_user = [undefined, undefined, undefined, undefined]

            for (const [user, votes] of Object.entries(votersCommitees)) {
                if (votes >= max[0]) {
                    max[0] = votes;
                    max_user[0] = user;
                }
            }
            for (const [user, votes] of Object.entries(votersCommitees)) {
                if (votes >= max[1] && user != max_user[0]) {
                    max[1] = votes;
                    max_user[1] = user;
                }
            }
            for (const [user, votes] of Object.entries(votersCommitees)) {
                if (votes >= max[2] && user != max_user[0] && user != max_user[1]) {
                    max[2] = votes;
                    max_user[2] = user;
                }
            }
            for (const [user, votes] of Object.entries(votersCommitees)) {
                if (votes >= max[3] && user != max_user[0] && user != max_user[1] && user != max_user[2]) {
                    max[3] = votes;
                    max_user[3] = user;
                }
            }

            sel_vote_1 = max_user[0];
            sel_vote_2 = max_user[1];
            sel_vote_3 = max_user[2];
            sel_vote_4 = max_user[3];
        }

        if (sel_pres == undefined) {
            sel_pres = client.user.id;
        }
        if (sel_vp == undefined) {
            sel_vp = client.user.id;
        }
        if (sel_lead == undefined) {
            sel_lead = client.user.id;
        }
        if (sel_vote_1 == undefined) {
            sel_vote_1 = client.user.id;
        }
        if (sel_vote_2 == undefined) {
            sel_vote_2 = client.user.id;
        }
        if (sel_vote_3 == undefined) {
            sel_vote_3 = client.user.id;
        }
        if (sel_vote_4 == undefined) {
            sel_vote_4 = client.user.id;
        }

        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["president", sel_pres]);
        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["vicepresident", sel_vp]);

        let user = await server.members.fetch(sel_pres);
        user.roles.add(Roles.President);
        user.roles.add(Roles.Executive);


        user = await server.members.fetch(sel_vp);
        user.roles.add(Roles.VicePresident);
        user.roles.add(Roles.Executive);

        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["leadAdmin", sel_lead]);

        user = await server.members.fetch(sel_lead);
        user.roles.add(Roles.LeadAdmin);
        user.roles.add(Roles.Executive);

        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["votersCommitee", sel_vote_1]);
        user = await server.members.fetch(sel_vote_1);
        user.roles.add(Roles.VotingCommitee);
        user.roles.add(Roles.Executive);
        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["votersCommitee", sel_vote_2]);
        user = await server.members.fetch(sel_vote_2);
        user.roles.add(Roles.VotingCommitee);
        user.roles.add(Roles.Executive);
        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["votersCommitee", sel_vote_3]);
        user = await server.members.fetch(sel_vote_3);
        user.roles.add(Roles.VotingCommitee);
        user.roles.add(Roles.Executive);
        db.run("INSERT INTO roles (role, user) VALUES (?, ?)", ["votersCommitee", sel_vote_4]);
        user = await server.members.fetch(sel_vote_4);
        user.roles.add(Roles.VotingCommitee);
        user.roles.add(Roles.Executive);

        client.channels.cache.get(Channels.Announcements).send({ content: `Please congratulate the following candidates: \n\nPresident: <@${sel_pres}>\nVP: <@${sel_vp}>\nLead Admin: <@${sel_lead}>\nVoters Commitee: <@${sel_vote_1}> <@${sel_vote_2}> <@${sel_vote_3}> <@${sel_vote_4}>` });

    }


}, 5000);

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS candidates (user TEXT, role TEXT, votes INTEGER)");
    db.run("CREATE TABLE IF NOT EXISTS voted_pres (user TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS voted_lead (user TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS voted_vote (user TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS roles (role TEXT, user TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS current (period TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS processed_audit_logs (id TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS votes (name TEXT, fields TEXT, time BIGINT, id TEXT)");
    client.login(token);
})