declare module 'adbkit2' {
    interface IClientCreationOptions {
        host?: string,
        port?: string,
    }

    interface IDevice {
        id: string,
        type: string,
    }

    interface Client {
        listDevices(callback?: (err: Error, resp: any) => void): Promise<IDevice[]>;
    }

    class Adb {
        static createClient(options: IClientCreationOptions): Client;
    }

    export = Adb;
}