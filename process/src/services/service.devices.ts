import adb = require('adbkit2');
import Logger from '../env/env.logger';
import PluginIPCService from 'chipmunk.plugin.ipc';
import { IPCMessages } from 'chipmunk.plugin.ipc';
import { ERenderEvents } from '../consts/events';
import { IIOState, IOptions, ControllerAdbDevice } from '../controllers/controller.adbdevices';

export interface IListeners {
    onData: (chunk: Buffer) => void;
    onError: (error: Error) => void;
    onDisconnect: () => void;
}

export interface IDeviceInfo {
    name: string;
}

export interface IDeviceState {
    ioState: IIOState,
    connections: number;
}

class ServiceDevices {
    private _adbClient: any;
    private _controllers: Map<string, ControllerAdbDevice> = new Map();
    private _listeners: Map<string, Map<string, IListeners>> = new Map();
    private _logger: Logger = new Logger('AdbDeviceManager');
    private _token: string | undefined;
    private _connectedDevicesState: {
        timer: any,
        attempts: number,
        state: { [key: string]: IDeviceState }
    } = {
            timer: -1,
            attempts: 0,
            state: {}
        };

    constructor() {
        this._adbClient = adb.createClient({
            host: 'localhost',
            port: '5037',
        });
    }

    public destroy(): Promise<void> {
        return new Promise((resolve) => {
            this._listeners.clear();

            Promise.all(Array.from(this._controllers.keys()).map((device: string) => {
                return this._close(device);
            })).then(() => {
                this._controllers.clear();
                resolve();
            });
        });
    }

    public refDevice(session: string, options: IOptions, listeners: IListeners): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof options !== 'object' || options === null) {
                return reject(new Error(this._logger.error(`Fail to get device handler because options is not an object`)));
            }
            if (typeof options.device !== 'string' || options.device.trim() === '') {
                return reject(new Error(this._logger.error(`Fail to get device handler because "device" is incorrect: ${options.device}`)));
            }

            let controller: ControllerAdbDevice | undefined = this._controllers.get(options.device);
            if (controller !== undefined) {
                this._refDeviceListeners(session, options.device, listeners).then(resolve);
                return;
            }

            controller = new ControllerAdbDevice(this._adbClient, options);
            controller.open().then(() => {
                if (controller === undefined) {
                    return;
                }

                controller.on(ControllerAdbDevice.Events.data, this._onData.bind(this, options.device));
                controller.on(ControllerAdbDevice.Events.error, this._onError.bind(this, options.device));
                controller.on(ControllerAdbDevice.Events.disconnect, this._onDisconnect.bind(this, options.device));
                this._controllers.set(options.device, controller);
                this._refDeviceListeners(session, options.device, listeners).then(resolve);
            }).catch((error: Error) => {
                reject(new Error(this._logger.error(`Fail to initiate logcat stream due to error: ${error.message}`)));
            });
        });
    }

    public unrefDevice(session: string, device: string): Promise<void> {
        return this._unrefDeviceListeners(session, device);
    }

    public write(device: string, chunk: Buffer | string): Promise<void> {
        return new Promise((resolve, reject) => {
            let controller: ControllerAdbDevice | undefined = this._controllers.get(device);
            if (controller === undefined) {
                return reject(new Error(this._logger.error(`Fail to send command to ADB devices "${device}" because it is not created`)));
            }

            controller.sendCommand(chunk).then(resolve).catch(reject);
        });
    }

    public getList(): Promise<IDeviceInfo[]> {
        return new Promise((resolve, reject) => {
            this._adbClient.listDevices().then((devices: any) => {
                resolve(devices.map((d: any) => {
                    return { name: d.id };
                }));
            }).catch((error: Error | null | undefined) => {
                if (error) {
                    reject(new Error(this._logger.error(`Failed to get list of devices due to error: ${error.message}`)));
                } else {
                    reject(new Error(this._logger.error(`Failed to get list of devices due to an unknown error.`)));
                }
            });
        });
    }

    public create(device: string) {
        // We don't need to do anything here.
    }

    public setToken(token: string) {
        this._token = token;
    }

    private _close(device: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let controller: ControllerAdbDevice | undefined = this._controllers.get(device);
            if (controller === undefined) {
                return resolve();
            }

            controller.destroy().catch((error: Error) => {
                this._logger.error(`Error on destroying connection to device "${device}": ${error.message}`);
            }).finally(() => {
                this._controllers.delete(device);
                resolve();
            });
        });
    }

    private _refDeviceListeners(session: string, device: string, listeners: IListeners): Promise<void> {
        return new Promise((resolve) => {
            let stored: Map<string, IListeners> | undefined = this._listeners.get(device);

            if (stored === undefined) {
                stored = new Map();
            }

            stored.set(session, listeners);
            this._listeners.set(device, stored);
            this._updateConnectedDevicesState();
            this._updateControllerSignatureState(session);
            resolve();
        })
    }

    private _unrefDeviceListeners(session: string, device: string): Promise<void> {
        return new Promise((resolve) => {
            let stored: Map<string, IListeners> | undefined = this._listeners.get(device);
            if (stored === undefined) {
                return resolve();
            }

            stored.delete(session);
            if (stored.size === 0) {
                this._listeners.delete(device);
                return this._close(device).then(() => {
                    this._updateConnectedDevicesState();
                    this._updateControllerSignatureState(session);
                    resolve();
                });
            }

            this._listeners.set(device, stored);
            this._updateControllerSignatureState(session);
            this._updateConnectedDevicesState();
            resolve();
        });
    }

    private _unrefDeviceAllListeners(device: string): Promise<void> {
        return new Promise((resolve) => {
            let stored: Map<string, IListeners> | undefined = this._listeners.get(device);
            this._listeners.delete(device);
            this._close(device).then(() => {
                this._updateConnectedDevicesState();
                if (stored !== undefined) {
                    Array.from(stored.keys()).forEach((session: string) => {
                        this._updateControllerSignatureState(session);
                    });
                }
                resolve();
            });
        });
    }

    private _onData(device: string, chunk: Buffer) {
        const listeners: Map<string, IListeners> | undefined = this._listeners.get(device);
        if (listeners === undefined) {
            return;
        }

        listeners.forEach((listeners: IListeners) => {
            listeners.onData(chunk);
        });

        this._updateConnectedDevicesState();
    }

    private _onError(device: string, error: Error) {
        const listeners: Map<string, IListeners> | undefined = this._listeners.get(device);
        if (listeners === undefined) {
            return;
        }

        listeners.forEach((listeners: IListeners) => {
            listeners.onError(error);
        });
        this._unrefDeviceAllListeners(device);
    }

    private _onDisconnect(device: string) {
        const listeners: Map<string, IListeners> | undefined = this._listeners.get(device);
        if (listeners === undefined) {
            return;
        }

        listeners.forEach((listeners: IListeners) => {
            listeners.onDisconnect();
        });

        this._unrefDeviceAllListeners(device);
    }

    private _getConnectionsCount(device: string) {
        const listeners: Map<string, IListeners> | undefined = this._listeners.get(device);
        if (listeners === undefined) {
            return 0;
        }

        return listeners.size;
    }

    private _updateConnectedDevicesState() {
        clearTimeout(this._connectedDevicesState.timer);
        this._connectedDevicesState.state = {};
        this._controllers.forEach((controller: ControllerAdbDevice) => {
            this._connectedDevicesState.state[controller.getDeviceName()] = {
                connections: this._getConnectionsCount(controller.getDeviceName()),
                ioState: controller.getIOState(),
            };
        });

        if (Object.keys(this._connectedDevicesState.state).length === 0) {
            return;
        }

        if (this._connectedDevicesState.attempts < 10) {
            this._connectedDevicesState.attempts += 1;
            this._connectedDevicesState.timer = setTimeout(() => {
                this._sendConnectedDevicesState();
            }, 250);
        } else {
            this._sendConnectedDevicesState();
        }
    }

    private _updateControllerSignatureState(session: string) {
        const devices: string[] = [];

        this._listeners.forEach((listeners: Map<string, IListeners>, device: string) => {
            if (listeners.has(session)) {
                devices.push(device);
            }
        });

        devices.forEach((device: string) => {
            let controller: ControllerAdbDevice | undefined = this._controllers.get(device);
            if (controller === undefined) {
                return;
            }

            controller.setSignature(devices.length > 1 ? true : false);
        });
    }

    private _sendConnectedDevicesState() {
        if (typeof this._token !== 'string') {
            return;
        }

        this._connectedDevicesState.attempts = 0;
        PluginIPCService.sendToPluginHost('*', {
            event: ERenderEvents.state,
            streamId: '*',
            token: this._token,
            state: this._connectedDevicesState.state,
        });
    }
}

export default new ServiceDevices();