import objectInspect from 'object-inspect';
import { loadJson, storeJson } from '../helpers/storage';

const LOG_LIMIT_NUM_FILES = 4;
const LOG_LIMIT_LINES_PER_FILE = 250;
type LogStorageStatus = {
  subkey: number;
  firstTimestamp: string;
  arrayLength: number;
}[];

export type LogLine = [string, string];

export class AsyncStorageLogger {
  logStorageStatus: LogStorageStatus = [];
  readyPromise: Promise<void>;
  queue: LogLine[];

  constructor() {
    this.queue = [];
    this.readyPromise = this.checkStatus();
    this.writeQueueWhenReady();
  }

  async checkStatus() {
    for (let subkey = 0; subkey < LOG_LIMIT_NUM_FILES; subkey++) {
      const content = await loadJson<LogLine[]>(`logs:v0:${subkey}`);
      if (content == null || content.length === 0) {
        this.logStorageStatus.push({
          subkey,
          firstTimestamp: '0000-00-00T00:00:00.000Z',
          arrayLength: 0,
        });
      } else {
        const [firstTimestamp] = content[0];
        this.logStorageStatus.push({
          subkey,
          firstTimestamp,
          arrayLength: content.length,
        });
      }
    }
  }

  async _writeQueue() {
    if (this.queue.length === 0) {
      return;
    }
    // empty queue
    const currQueue = this.queue.splice(0);
    const files = this.logStorageStatus.slice();
    // timestamp DESC, subkey DESC
    files.sort((a, b) => {
      if (a.firstTimestamp !== b.firstTimestamp) {
        return a.firstTimestamp > b.firstTimestamp ? -1 : 1;
      }
      return -a.subkey + b.subkey;
    });
    const useFirstFile =
      files[0].arrayLength + currQueue.length <=
      Math.max(currQueue.length, LOG_LIMIT_LINES_PER_FILE);
    const file = useFirstFile ? files[0] : files[files.length - 1];
    let content = (await loadJson<LogLine[]>(`logs:v0:${file.subkey}`)) || [];

    if (!useFirstFile || file.arrayLength === 0) {
      const [ts] = currQueue[0];
      file.firstTimestamp = ts;
      file.arrayLength = 0;
      content = [];
    }
    content.push(...currQueue);
    file.arrayLength += currQueue.length;
    this.logStorageStatus[file.subkey] = file;
    await storeJson(`logs:v0:${file.subkey}`, content);
  }

  async writeQueueWhenReady() {
    await this.readyPromise;
    this.readyPromise = this._writeQueue();
  }

  async readLogs() {
    await this.readyPromise;
    let files = this.logStorageStatus.slice();
    // timestamp ASC
    files.sort((a, b) => {
      if (a.firstTimestamp !== b.firstTimestamp) {
        return a.firstTimestamp < b.firstTimestamp ? -1 : 1;
      }
      return -a.subkey + b.subkey;
    });
    files = files.filter((f) => f.arrayLength > 0);
    const lines = [];
    for (const file of files) {
      const content =
        (await loadJson<LogLine[]>(`logs:v0:${file.subkey}`)) || [];
      lines.push(...content);
    }
    return lines;
  }

  _log(severity: string, msg: any) {
    let json;
    if (msg instanceof Error) {
      const msgObject: any = { name: msg.name, message: msg.message };
      if (msg.stack) {
        msgObject.stack = msg.stack;
      }
      json = JSON.stringify(msgObject);
    } else {
      json = objectInspect(msg);
    }
    this.queue.push([
      new Date().toISOString(),
      `${severity.padEnd(7, ' ')} ${json}`,
    ]);
    this.writeQueueWhenReady();
  }

  info(msg: any) {
    this._log('INFO', msg);
  }

  warn(msg: any) {
    this._log('WARNING', msg);
  }

  error(msg: any) {
    this._log('ERROR', msg);
  }
}
