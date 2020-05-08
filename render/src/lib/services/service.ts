import * as Toolkit from 'chipmunk.client.toolkit';
import { EHostCommands, EHostEvents } from '../common/host.events';
import { IOptions } from '../common/interface.options';
import { Observable, Subject } from 'rxjs';
import { IDeviceState, IDeviceSession } from '../common/interface.deviceinfo';
import { SidebarTitleAddComponent } from '../views/dialog/titlebar/components';
import { ENotificationType } from 'chipmunk.client.toolkit';

export class Service extends Toolkit.APluginService {
  public state: { [device: string]: IDeviceState } = {};
  public savedSession: { [session: string]: IDeviceSession } = {};
  public sessionConnected: { [session: string]: { [device: string]: IDeviceState } } = {};
  public recentDevices: string[] = [];

  private api: Toolkit.IAPI | undefined;
  private session: string;
  private sessions: string[] = [];
  private _subscriptions: { [key: string]: Toolkit.Subscription } = {};
  private _logger: Toolkit.Logger = new Toolkit.Logger(`Plugin: adb: inj_output_bot:`);
  private _openQueue: { [port: string]: boolean } = {};
  private _messageQueue: {[ port: string ]: string[]} = {};
  private _subjects = {
    event: new Subject<any>(),
  };

  constructor() {
    super();
    this._subscriptions.onAPIReady = this.onAPIReady.subscribe(this._onAPIReady.bind(this));
  }

  private _onAPIReady() {
    this.api = this.getAPI();
    if (this.api === undefined) {
      this._logger.error('API not found!');
      return;
    }

    this._subscriptions.onSessionOpen = this.api.getSessionsEventsHub().subscribe().onSessionOpen(this._onSessionOpen.bind(this));
    this._subscriptions.onSessionClose = this.api.getSessionsEventsHub().subscribe().onSessionClose(this._onSessionClose.bind(this));
    this._subscriptions.onSessionChange = this.api.getSessionsEventsHub().subscribe().onSessionChange(this._onSessionChange.bind(this));
  }

  private _onSessionOpen() {
    this.session = this.api.getActiveSessionId();
    if (this.sessions.includes(this.session)) {
      return;
    }
    if (this.sessions.length === 0) {
      this.incomeMessage();
    }
    this.sessions.push(this.session);
  }

  private _onSessionClose(guid: string) {
    this.sessions = this.sessions.filter(session => session !== guid);
    delete this.savedSession[guid];
  }

  private _onSessionChange(guid: string) {
    this.session = guid;
  }

  public getObservable(): { event: Observable<any> } {
    return {
      event: this._subjects.event.asObservable(),
    }
  }

  public incomeMessage() {
    this._subscriptions.incomeIPCHostMessage = this.api.getIPC().subscribe((message: any) => {
      if (typeof message !== 'object' && message === null) {
        return;
      }

      if (message.streamId !== this.session && message.streamId !== '*') {
        return;
      }

      if (message.event === EHostEvents.spyState) {
        this._subjects.event.next(message.load);
        return;
      }

      if (message.event === EHostEvents.state) {
        this._saveLoad(message.state).then((response: { [device: string]: IDeviceState }) => {
          if (response === undefined) {
            return;
          }

          this.state = response;
          this._subjects.event.next(message);
        }).catch((error: Error) => {
          this._logger.error(error);
        });
        return;
      }
      this._subjects.event.next(message);
    });
  }

  private _saveLoad(devices: { [key: string]: IDeviceState }): Promise<{ [device: string]: IDeviceState } | void> {
    return new Promise<{ [device: string]: IDeviceState }>((resolve) => {
      if (Object.keys(this.sessionConnected).length > 0) {
        Object.keys(this.sessionConnected).forEach(session => {
          Object.keys(this.sessionConnected[session]).forEach(device => {
            if (devices[device]) {
              this.sessionConnected[session][device].ioState.read += devices[device].ioState.read;
            }
          });
        });
        resolve(this.sessionConnected[this.session]);
      } else {
        resolve();
      }
    }).catch((error: Error) => {
      this._logger.error(error);
    });
  }

  private emptyQueue(device: string) {
    if (this._messageQueue[device]) {
      this._messageQueue[device].forEach((message) => {
        this.sendMessage(message, device);
      });
    }
  }

  public connect(options: IOptions): Promise<void> {
    return this.api.getIPC().request({
      stream: this.session,
      command: EHostCommands.open,
      options: options,
    }, this.session).then(() => {
      this.recentDevices.push(options.device);

      if (this.sessionConnected[this.session] === undefined) {
        this.sessionConnected[this.session] = {};
      }

      if (this.sessionConnected[this.session][options.device] === undefined) {
        this.sessionConnected[this.session][options.device] = {
          connections: 0,
          ioState: {
            written: 0,
            read: 0
          },
        }
      }

      this._openQueue[options.device] = true;
      this.emptyQueue(options.device);
    }).catch((error: Error) => {
      this._logger.error(error);
    });
  }

  public disconnect(device: string): Promise<any> {
    return this.api.getIPC().request({
      stream: this.session,
      command: EHostCommands.close,
      device: device,
    }, this.session).then(() => {
      this._openQueue[device] = false;
      this.sessionConnected[this.session][device] = undefined;
    }).catch((error: Error) => {
      this._logger.error(error);
    });
  }

  public requestDevices(): Promise<any> {
    return this.api.getIPC().request({
      stream: this.session,
      command: EHostCommands.list,
    }, this.session).catch((error: Error) => {
      this._logger.error(error);
    })
  }

  public startSpy(options: IOptions[]): Promise<any> {
    return this.api.getIPC().request({
      stream: this.session,
      command: EHostCommands.spyStart,
      options: options,
    }, this.session).catch((error: Error) => {
      this._logger.error(error);
    });
  }

  public stopSpy(options: IOptions[]): Promise<any> {
    return this.api.getIPC().request({
      stream: this.session,
      command: EHostCommands.spyStop,
      options: options,
    }, this.session).catch((error: Error) => {
      this._logger.error(error);
    });
  }

  public sendMessage(message: string, device: string): Promise<any> {
    return this.api.getIPC().request({
      stream: this.session,
      command: EHostCommands.write,
      cmd: message,
      device: device,
    }, this.session).catch((error: Error) => {
      this._logger.error(`Cannot send message due to error: ${error}`);
    });
  }

  public popupButton(action: (boolean) => void) {
    this.api.setSidebarTitleInjection({
      factory: SidebarTitleAddComponent,
      inputs: {
        _ng_addDevice: action,
      }
    });
  }

  public closePopup(popup: string) {
    this.api.removePopup(popup);
  }

  public notify(caption: string, message: string, type: ENotificationType) {
    if (this.api) {
      this.api.addNotification({
        caption: caption,
        message: message,
        options: {
          type: type,
        }
      });
    } else {
      this._logger.error('API not found!');
    }

    if (type === ENotificationType.error) {
      this._logger.error(message);
    } else if (type === ENotificationType.warning) {
      this._logger.warn(message);
    } else {
      this._logger.info(message);
    }
  }
}

export default (new Service());
