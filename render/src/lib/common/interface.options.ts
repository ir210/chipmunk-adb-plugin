export interface IDeviceOptions {

}

export interface IOptions {
  device: string;
  options: IDeviceOptions;
}

export const CDefaultOptions: IOptions = {
  device: '',
  options: {

  }
};
