import Logger from '../env/env.logger';
import { IOptions } from './controller.adbdevices';
import ServiceDevices from '../services/service.devices';
import PluginIPCService from 'chipmunk.plugin.ipc';
import { ERenderEvents } from '../consts/events';
import { prototype } from 'events';

export interface IDeviceChunk {
    chunk: string;
    device: string;
}

export interface IDeviceError {
    error: Error;
    device: string;
}

const PSEUDO_SESSION = `*`;

export class ControllerSession {
    private _session: string;
    private _devices: string[] = [];
    private _logger: Logger;
    private _readLoad: { [key: string]: number } = {};

    constructor(session: string) {
        this._session = session;
        this._logger = new Logger(`Controllersession: ${session}`);
    }

    public destroy(): Promise<void> {
        return new Promise((resolve) => {
            if (this._devices.length === 0) {
                return resolve();
            }

            Promise.all(this._devices.map((device: string) => {
                return new Promise((resolveUnrefPort) => {
                    ServiceDevices.unrefDevice(this._session, device).catch((errorUnrefDevice: Error) => {
                        this._logger.error(`Error while unrefing device: ${errorUnrefDevice.message}`);
                    }).finally(() => {
                        resolveUnrefPort();
                    });
                });
            })).then(() => {
                resolve();
            });
        });
    }

    public open(options: IOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof options !== 'object' || options === null) {
                return reject(new Error(this._logger.error(`Options should be object. Gotten type: "${typeof options}"`)));
            }
            if (typeof options.device !== 'string' || options.device.trim() === '') {
                return reject(new Error(this._logger.error(`Wrong "name" definition`)));
            }
            /*
            if (this._isDeviceRefed(options.device)) {
                return reject(new Error(this._logger.error(`Device "${options.device}" is already assigned with session "${this._session}"`)));
            }
            */

            ServiceDevices.refDevice(this._session, options, {
                onData: this._onDeviceData.bind(this, options.device),
                onError: this._onDeviceError.bind(this, options.device),
                onDisconnect: this._onDeviceDisconnect.bind(this, options.device)
            }).then(() => {
                this._logger.env(`Device "${options.device}" is assigned with session "${this._session}"`);
                // Save data
                this._devices.push(options.device);
                // Notify render
                PluginIPCService.sendToPluginHost(this._session, {
                    event: ERenderEvents.connected,
                    streamId: this._session,
                    device: options.device,
                });
                resolve();
            }).catch((openErr: Error) => {
                reject(new Error(this._logger.error(`Fail to open device "${options.device}" due to error: ${openErr.message}`)));
            });
        });
    }

    public close(device: string): Promise<void> {
        return new Promise((resolve, reject) => {
            /*
            if (!this._isDeviceRefed(device)) {
                return reject(new Error(this._logger.error(`Device "${device}" is not assigned with session "${this._session}"`)));
            }
            */

            ServiceDevices.unrefDevice(this._session, device).catch((error: Error) => {
                this._logger.error(`Fail unref normally device "${device}" from session "${this._session}" due to error: ${error.message}`);
            }).finally(() => {
                this._removeDevice(device);
                resolve();
            })
        });
    }

    public spyStart(options: IOptions[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this._readLoad = {};
            Promise.all(
                options.map((option: IOptions) => {
                    this._devices.push(option.device);
                    return ServiceDevices.refDevice(PSEUDO_SESSION, option, {
                        onData: this._readSpyLoad.bind(this, option.device),
                        onError: this._onDeviceError.bind(this, option.device),
                        onDisconnect: this._onSpyDeviceDisconnect.bind(this, option.device),
                    });
                }),
            ).then(() => {
                this._logger.env(`Starting to spy`);
                resolve();
            }).catch((openErr: Error) => {
                reject(new Error(this._logger.error(`Failed to start spying on ports due to error: ${openErr.message}`)));
            });
        });
    }
    
    public spyStop(options: IOptions[]): Promise<void> {
        return new Promise((resolve, reject) => {
            Promise.all(
                options.map((option: IOptions) => {
                    /*
                    if (!this._isDeviceRefed(option.device)) {
                        return reject(new Error(this._logger.error(`Device "${option.device}" is not being spied on`)));
                    }
                    */

                    return ServiceDevices.unrefDevice(PSEUDO_SESSION, option.device).then(() => {
                        this._removeDevice(option.device);
                    }).catch((error: Error) => {
                        this._logger.error(`Failed to unref normally device "${option.device} while spying do to error: ${error.message}`);
                    });
                })
            ).then(() => {
                this._logger.env(`Devices no longer being spied on`);
                resolve();
            }).catch((openErr: Error) => {
                reject(new Error(this._logger.error(`Failed to stop spying due to error: ${openErr.message}`)));
            });
        });
    }

    private _readSpyLoad(device: string, chunk: Buffer) {
        if (this._readLoad[device] === undefined) {
            this._readLoad[device] = 0;
        }

        this._readLoad[device] = chunk.length;

        PluginIPCService.sendToPluginHost(this._session, {
            event: ERenderEvents.spyState,
            streamId: this._session,
            load: this._readLoad,
        }).catch((error: Error) => {
            this._logger.error(error);
        });
    }

    private _onDeviceData(device: string, chunk: Buffer) {
        PluginIPCService.sendToStream(chunk, this._session);
    }

    private _onDeviceError(device: string, error: Error) {
        PluginIPCService.sendToPluginHost(this._session, {
            event: ERenderEvents.error,
            streamId: this._session,
            error: error.message,
            port: prototype,
        });
        this._logger.error(`Device "${device}" return error: ${error.message}`);
        this._removeDevice(device);
    }

    private _onDeviceDisconnect(device: string) {
        PluginIPCService.sendToPluginHost(this._session, {
            event: ERenderEvents.disconnected,
            streamId: this._session,
            device: device,
        });
        this._logger.error(`Device "${device}" is disconnected`);
        this._removeDevice(device);
    }

    private _onSpyDeviceDisconnect(device: string) {
        this._logger.error(`Device "${device}" is disconnected`);
        this._removeDevice(device);
    }

    private _removeDevice(device: string) {
        const index: number = this._devices.indexOf(device);
        if (index === -1) {
            return;
        }

        this._devices.splice(index, 1);
    }

    private _isDeviceRefed(device: string): boolean {
        return this._devices.indexOf(device) !== -1;
    }
}