declare module 'adbkit' {
    export interface IClientCreationOptions {
        host?: string,
        port?: string,
    }

    export interface IDevice {
        id: string,
        type: string,
    }

    export interface Client {
        listDevices(callback?: (err: Error, resp: any) => void): Promise<IDevice[]>;
    }

    export default class Adb {
        static createClient(options: IClientCreationOptions): Client;
    }
}