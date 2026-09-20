/**
 * The one thing workflows need from the notification system: send a plain message to an address.
 * A port (abstract class used as a DI token) so workflows do not import the notify module — notify
 * already depends on workflows for its own governed action, and the two must not form a cycle.
 * `NotifyModule` provides the implementation.
 */
export abstract class WorkflowMessenger {
  abstract sendMessage(input: {
    event: string;
    recipient: string;
    recipientRef?: string;
    localeCode?: string;
    title: string;
    body: string;
    sourceType?: string;
    sourceId?: string;
  }): Promise<void>;
}
