export interface IDeviceInfo {
  name: string;
}

export interface IIOState {
  read: number;
  written: number;
}

export interface IDeviceState {
  ioState: IIOState;
  connections: number;
}

export interface IDeviceSession {
  default: string;
  devices: IDeviceInfo[];
}
