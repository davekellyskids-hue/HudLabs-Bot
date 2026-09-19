import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

// Attachment safety limits (kept local so only this file needs to change)
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
    'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'vbs', 'vbe',
    'js', 'jse', 'wsf', 'wsh', 'ps1', 'ps1xml', 'psc1', 'msh', 'msh1', 'msh2',
    'jar', 'apk', 'app', 'deb', 'rpm', 'sh', 'bash', 'run', 'dll', 'sys', 'gadget'
]);

// Recipient slots. Add more names here AND a matching .addUserOption below
// (Discord allows max 25 options per command).
const RECIPIENT_OPTION_NAMES = ['user', 'user2', 'user3', 'user4', 'user5'];

// Roles allowed to run /dm (in addition to anyone with Moderate Members).
// ADD NEW STAFF ROLE IDS HERE (right-click role > Copy Role ID, needs Developer Mode).
const STAFF_ROLE_IDS = [
    '1531933955161460867',
    '1550229956204699731',
];

// Delay between DMs so we don't hammer the rate limit
const DM_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getFileExtension(filename = '') {
    const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
    return match ? match[1].toLowerCase() : '';
}

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message (and optional file) to up to 5 users (Staff only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to send a DM to")
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName("user2")
                .setDescription("Additional user to send the DM to")
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName("user3")
                .setDescription("Additional user to send the DM to")
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName("user4")
                .setDescription("Additional user to send the DM to")
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName("user5")
                .setDescription("Additional user to send the DM to")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send (optional if a file is attached)")
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName("file")
                .setDescription("A file to attach to the DM (optional)")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Send the message anonymously (default: false)")
                .setRequired(false)
        )
        // null = visible to everyone; access is enforced in execute() via STAFF_ROLE_IDS / permission check
        .setDefaultMemberPermissions(null)
        .setDMPermission(false),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        // Access check: Moderate Members permission OR any role in STAFF_ROLE_IDS
        const hasStaffPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ?? false;
        const hasStaffRole = interaction.member?.roles?.cache?.some(role => STAFF_ROLE_IDS.includes(role.id)) ?? false;

        if (!hasStaffPermission && !hasStaffRole) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You do not have permission to use this command.' });
        }

        const message = interaction.options.getString("message");
        const attachment = interaction.options.getAttachment("file");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            // Collect recipients (deduped by ID, bots skipped)
            const recipients = new Map();
            const skippedBots = [];

            for (const optionName of RECIPIENT_OPTION_NAMES) {
                const picked = interaction.options.getUser(optionName);
                if (!picked) continue;

                if (picked.bot) {
                    skippedBots.push(picked.tag);
                    continue;
                }

                recipients.set(picked.id, picked);
            }

            if (recipients.size === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot send DMs to bot accounts.' });
            }

            if (!message && !attachment) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Provide a message, a file, or both.' });
            }

            if (message && message.length > 2000) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Messages must be under 2000 characters.' });
            }

            let files;
            if (attachment) {
                if (attachment.size > MAX_ATTACHMENT_SIZE_BYTES) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `That file is too large to relay (limit: ${Math.floor(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))} MB).`
                    });
                }

                const extension = getFileExtension(attachment.name);
                if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `Files with the ".${extension}" extension can't be sent through this command for safety reasons.`
                    });
                }

                files = [{ attachment: attachment.url, name: attachment.name }];
            }

            const sanitized = message ? sanitizeMarkdown(message) : null;

            const dmEmbed = successEmbed(
                anonymous ? "Message from the Staff Team" : `Message from ${interaction.user.tag}`,
                sanitized || (attachment ? `Sent you a file: **${attachment.name}**` : '')
            ).setFooter({
                text: `You cannot reply to this message. | Logger ID: ${interaction.id}`
            });

            const sent = [];
            const failed = [];
            const recipientList = [...recipients.values()];

            for (let i = 0; i < recipientList.length; i++) {
                const targetUser = recipientList[i];

                try {
                    const dmChannel = await targetUser.createDM();

                    await dmChannel.send({
                        embeds: [dmEmbed],
                        ...(files ? { files } : {})
                    });

                    sent.push(targetUser);
                } catch (error) {
                    logger.error(`DM command error (target ${targetUser.id}):`, error);
                    failed.push({
                        user: targetUser,
                        reason: error.code === 50007 ? 'DMs disabled' : error.message
                    });
                    continue;
                }

                try {
                    await logEvent({
                        client: interaction.client,
                        guild: interaction.guild,
                        event: {
                            action: "DM Sent",
                            target: `${targetUser.tag} (${targetUser.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}${attachment ? ` | Attachment: ${attachment.name}` : ''}`,
                            metadata: {
                                userId: targetUser.id,
                                moderatorId: interaction.user.id,
                                anonymous,
                                messageLength: sanitized ? sanitized.length : 0,
                                attachmentName: attachment?.name || null,
                                attachmentSize: attachment?.size || null,
                                batchSize: recipientList.length
                            }
                        }
                    });
                } catch (logError) {
                    logger.warn(`Failed to log DM event for ${targetUser.id}:`, logError);
                }

                if (i < recipientList.length - 1) {
                    await sleep(DM_DELAY_MS);
                }
            }

            // Build result summary
            const lines = [];
            const what = attachment ? 'a message and file' : 'a message';

            if (sent.length) {
                lines.push(`✅ Sent ${what} to: ${sent.map(u => u.tag).join(', ')}`);
            }
            if (failed.length) {
                lines.push(`❌ Failed: ${failed.map(f => `${f.user.tag} (${f.reason})`).join(', ')}`);
            }
            if (skippedBots.length) {
                lines.push(`⚠️ Skipped bot accounts: ${skippedBots.join(', ')}`);
            }

            const summaryTitle = failed.length ? "DM Results" : "DM Sent";
            const summaryBuilder = failed.length ? warningEmbed : successEmbed;

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [summaryBuilder(summaryTitle, lines.join('\n'))],
            });
        } catch (error) {
            logger.error('DM command error:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Failed to send DM: ${error.message}` });
        }
    }
};
