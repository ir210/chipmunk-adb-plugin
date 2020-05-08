import Logger from '../env/env.logger';
import { EventEmitter } from 'events';

export interface IDeviceOptions {

}

export interface IOptions {
    device: string;
}

export interface IIOState {
    read: number;
    written: number;
}

export class ControllerAdbDevice extends EventEmitter {
    public static Events = {
        data: 'data',
        disconnect: 'disconnect',
        error: 'error',
    };

    private _adbClient: any;
    private _options: IOptions;
    private _logger: Logger;
    private _reader: any | undefined;

    private _read: number = 0;
    private _written: number = 0;
    private _signature: boolean = false;
    private _timeout: number = 50;
    private _size: number = 1;

    constructor(adbClient: any, options: IOptions) {
        super();
        this._adbClient = adbClient;
        this._options = options;
        this._logger = new Logger(`ControllerAdbDevice: ${options.device}`);

        this._onEntry = this._onEntry.bind(this);
        this._onError = this._onError.bind(this);
        this._onDisconnect = this._onDisconnect.bind(this);
    }

    public destroy(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._reader == undefined) {
                return resolve();
            }

            this._reader.end();
            return resolve();
        });
    }

    public open(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._reader !== undefined) {
                return reject(new Error(this._logger.error(`ADB device has already been opened`)));
            }

            const optErrs: Error | undefined = this._getOptionsErrors(this._options);

            if (optErrs) {
                return reject(new Error(this._logger.error(`Error opening ADB device, because options are not valid: ${optErrs.message}`)));
            }

            const deviceName = this._options.device;

            this._adbClient.openLogcat(deviceName).then((reader: any) => {
                this._reader = reader;
                reader.on('entry', this._onEntry);
                reader.on('error', this._onError);
                reader.on('end', this._onDisconnect);
                reader.on('finish', this._onDisconnect);
                this._logger.info(`Connection to device "${deviceName}" is successful`);
                resolve();
            }).catch((error: Error) => {
                reject(new Error(this._logger.error(`Fail to initiate logcat stream due to error: ${error.message}`)));
            });
        });
    }

    public sendCommand(chunk: Buffer | string): Promise<void> {
        return new Promise((resolve, reject) => {
            // TODO: Send command to ADB devices.
        });
    }

    public getIOState(): IIOState {
        return {
            read: this._read,
            written: this._written,
        }
    }

    public getDeviceName(): string {
        return this._options.device;
    }

    public setSignature(value: boolean) {
        this._signature = value;
    }

    private _onEntry(entry: any) {
        const concatenatedRow = entry.date.toISOString() + " " + entry.pid + " " + entry.tid + " " + this._toPriorityChar(entry.priority) + " " + entry.tag + ": " + entry.message + "\r\n";
        const chunk: Buffer = Buffer.from(concatenatedRow);

        this._read = chunk.byteLength;
        this.emit(ControllerAdbDevice.Events.data, chunk)
    }

    private _onError(error: Error) {
        this.destroy().catch((destroyErr: Error) => {
            this._logger.error(`Fail to destroy connection to device due to error: ${destroyErr.message}`);
        }).finally(() => {
            this.emit(ControllerAdbDevice.Events.error, error);
        });
    }

    private _onDisconnect() {
        this.destroy().catch((destroyErr: Error) => {
            this._logger.error(`Fail to destroy connection to device due to error: ${destroyErr.message}`);
        }).finally(() => {
            this.emit(ControllerAdbDevice.Events.disconnect);
        });
    }

    private _getOptionsErrors(options: IOptions): Error | undefined {
        const errors: string[] = [];
        if (typeof options.device !== 'string' || options.device.trim() === '') {
            errors.push(`ADB device name should be defined as string. Got type: "${typeof options.device}`);
        }

        return errors.length > 0 ? new Error(errors.join('\n\t- ')) : undefined;
    }

    private _toPriorityChar(priority: number) {
        switch (priority) {
            case 0:
                return 'UNKNOWN';
            default:
            case 1:
                return 'DEFAULT';
            case 2:
                return 'V';
            case 3:
                return 'D';
            case 4:
                return 'I';
            case 5:
                return 'W';
            case 6:
                return 'E';
            case 7:
                return 'F';
            case 8:
                return 'SILENT';
        }
    }
}
