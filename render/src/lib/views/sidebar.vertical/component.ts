// tslint:disable:no-inferrable-types
// tslint:disable:max-line-length

import { Component, OnDestroy, ChangeDetectorRef, AfterViewInit, Input, ViewChild } from '@angular/core';
import * as Toolkit from 'chipmunk.client.toolkit';
import { InputStandardComponent } from 'chipmunk-client-primitive';
import { SafeHtml, DomSanitizer } from '@angular/platform-browser';
import { IDeviceInfo, IDeviceState, IDeviceSession } from '../../common/interface.deviceinfo';
import { IOptions, CDefaultOptions } from '../../common/interface.options';
import { SidebarVerticalDeviceDialogComponent } from '../dialog/components'
import { EHostEvents } from '../../common/host.events';
import Service from '../../services/service';
import { Subscription } from 'rxjs';
import { ENotificationType } from 'chipmunk.client.toolkit';

interface IConnected {
  device: IDeviceInfo;
  options: IOptions;
  state: IDeviceState;
}

interface IState {
  _ng_devices: IDeviceInfo[];
  _ng_connected: IConnected[];
  _ng_error: string | undefined;
  _ng_selected: IDeviceInfo | undefined;
}

interface IDeviceListItem {
  value: string;
  caption: string;
}

const state: Toolkit.ControllerState<IState> = new Toolkit.ControllerState<IState>();

@Component({
  selector: Toolkit.EViewsTypes.sidebarVertical,
  templateUrl: './template.html',
  styleUrls: ['./styles.less']
})
export class SidebarVerticalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('msgInput', { static: false }) _inputCom: InputStandardComponent;

  @Input() public api: Toolkit.IAPI;
  @Input() public session: string;
  @Input() public sessions: Toolkit.ControllerSessionsEvents;

  private _subscriptions: { [key: string]: Subscription } = {};
  private _logger: Toolkit.Logger = new Toolkit.Logger(`Plugin: adb: inj_output_bot:`);
  private _destroyed: boolean = false;
  private _chosenDevice: string = undefined;
  private _deviceOptions: IOptions[] = [];
  private _options: IOptions = Object.assign({}, CDefaultOptions);
  private _optionsCom: IOptions;

  public _ng_devices: IDeviceInfo[] = [];
  public _ng_connected: IConnected[] = [];
  public _ng_selected: IDeviceInfo | undefined;
  public _ng_busy: boolean = false;
  public _ng_error: string | undefined;
  public _ng_options: boolean = false;
  public _ng_msg: string;
  public _ng_deviceList: IDeviceListItem[] = [];
  public _ng_defaultDevice: string | undefined = undefined;

  constructor(private _cdRef: ChangeDetectorRef, private _sanitizer: DomSanitizer) {
    this._ng_sendMessage = this._ng_sendMessage.bind(this);
    this._ng_changeDropdownSelect = this._ng_changeDropdownSelect.bind(this);
    this._ng_connectDialog = this._ng_connectDialog.bind(this);
  }

  ngOnDestroy() {
    this._destroyed = true;
    this._saveState();
    Object.keys(this._subscriptions).forEach((key: string) => {
      this._subscriptions[key].unsubscribe();
    });
  }

  ngAfterViewInit() {
    Service.popupButton(this._ng_connectDialog);
    this._restoreDropdownSession();
    this._loadSession();

    // Subscribption to income events
    this._subscriptions.Subscription = Service.getObservable().event.subscribe((message: any) => {
      if (typeof message !== 'object' && message === null) {
        // Unexpected format of message
        return;
      }

      if (message.streamId !== this.session && message.streamId !== '*') {
        // No definition of streamId
        return;
      }

      this._onIncomeMessage(message);
    });

    // Restore state
    this._loadState();
    this._hostEvents_onState(Service.sessionConnected[this.session]);
  }

  public _ng_onDeviceSelect(device: IDeviceInfo) {
    if (this._ng_busy) {
      return false;
    }

    this._ng_error = undefined;
    this._ng_options = false;

    if (this._ng_selected === undefined) {
      this._ng_selected = device;
      this._forceUpdate();
      return;
    }

    if (this._ng_selected.name === device.name) {
      this._ng_selected = undefined;
    } else {
      this._ng_selected = device;
    }

    this._forceUpdate();
  }

  public _ng_canBeConnected(): boolean {
    if (this._ng_busy) {
      return false;
    }

    if (this._ng_selected === undefined) {
      return false;
    }

    let isConnected: boolean = false;

    this._ng_connected.forEach((connected: IConnected) => {
      if (this._ng_selected.name === connected.device.name) {
        isConnected = true;
      }
    });

    return !isConnected;
  }

  public _ng_onOptions() {
    this._ng_options = !this._ng_options;
    this._forceUpdate();
  }

  public _ng_onConnect() {
    if (!this._ng_canBeConnected()) {
      return;
    }

    const options: IOptions = this._optionsCom;

    this._ng_busy = true;
    this._ng_error = undefined;
    this._ng_options = false;
    this._forceUpdate();

    Service.connect(options).then(() => {
      this._ng_busy = false;
      this._ng_connected.push({
        device: this._ng_selected,
        options: options,
        state: {
          ioState: { read: 0, written: 0 },
          connections: 0,
        },
      });

      this._addDropdownElement(this._ng_selected);
      this._saveDropdownSession(this._ng_selected);
      this._ng_selected = undefined;
      this._forceUpdate();
    }).catch((error: Error) => {
      this._logger.error(this._error(`Fail to connect to device "${options.device}" due to error: ${error.message}`));
    });
  }

  public _ng_onDisconnectDevice(device: IDeviceInfo) {
    this._removeDropdownSession(device);
    this._removeDropdownElement(device);

    Object.values(Service.savedSession).forEach((element) => {
      const found = element.devices.find((eachDevice: IDeviceInfo) => eachDevice.name === device.name);
      if (!found) {
        return;
      }
    });

    this._ng_connected = this._ng_connected.filter((connected: IConnected) => {
      return connected.device.name !== device.name;
    })

    this._ng_busy = true;
    this._ng_error = undefined;
    this._ng_options = false;
    this._forceUpdate();

    Service.disconnect(device.name).then(() => {
      this._ng_busy = false;
      this._forceUpdate();
    }).catch((error: Error) => {
      this._logger.error(this._error(`Fail to close device "${device.name}" due to error: ${error.message}`));
    });
  }

  public _ng_onReloadDeviceList() {
    this._requestDeviceList();
  }

  private _onIncomeMessage(message: any) {
    if (typeof message.event === 'string') {
      return this._onIncomeEvent(message);
    }
  }

  private _onIncomeEvent(message: any) {
    switch (message.event) {
      case EHostEvents.connected:
        break;
      case EHostEvents.disconnected:
        this._hostEvents_onDisconnected(message.device);
        break;
      case EHostEvents.error:
        this._hostEvents_onError(message.device, message.error);
        break;
      case EHostEvents.state:
        this._hostEvents_onState(Service.state);
        break;
    }

    this._forceUpdate();
  }

  private _saveState() {
    state.save(this.session, {
      _ng_devices: this._ng_devices,
      _ng_connected: this._ng_connected,
      _ng_error: this._ng_error,
      _ng_selected: this._ng_selected,
    });
  }

  private _loadState() {
    this._ng_devices = [];
    this._ng_connected = [];
    this._ng_error = undefined;
    this._ng_selected = undefined;
    this._ng_busy = false;

    const stored: IState | undefined = state.load(this.session);
    if (stored === undefined || stored._ng_devices.length === 0) {
      this._requestDeviceList();
    } else {
      Object.keys(stored).forEach((key: string) => {
        (this as any)[key] = stored[key];
      });
    }

    this._forceUpdate();
  }

  private _requestDeviceList() {
    this._ng_devices = [];

    Service.requestDevices().then((resolve) => {
      Object.assign(this._ng_devices, resolve.devices);
      this._saveState();
      this._forceUpdate();
    }).catch((error: Error) => {
      this._logger.error(`Fail to get device list due to error: ${error.message}`);
    });
  }

  private _error(msg: string): string {
    this._ng_busy = false;
    this._ng_error = msg;
    this._ng_selected = undefined;
    this._forceUpdate();
    return msg;
  }

  private _forceUpdate() {
    if (this._destroyed) {
      return;
    }
    this._cdRef.detectChanges();
  }

  private _hostEvents_onState(devices: { [device: string]: IDeviceState }) {
    this._ng_connected = this._ng_connected.map((connected: IConnected) => {
      if (devices[connected.device.name]) {
        Object.assign(connected.state, devices[connected.device.name]);
      }

      return connected;
    });

    this._forceUpdate();
  }

  private _hostEvents_onDisconnected(device: string) {
    this._ng_connected = this._ng_connected.filter((connected: IConnected) => {
      return connected.device.name !== device;
    });

    this._requestDeviceList();
    this._forceUpdate();
  }

  private _hostEvents_onError(device: string, error: string) {
    this._error(`Device "${device}" error: ${error}`);
  }

  public _ng_sendMessage(message: string, event?: KeyboardEvent) {
    Service.sendMessage(message, this._chosenDevice).catch((error: Error) => {
      this._logger.error(error);
    });

    this._inputCom.setValue('');
  }

  private _addDropdownElement(device: IDeviceInfo) {
    this._ng_changeDropdownSelect(device.name);
    const entry: IDeviceListItem = { value: device.name, caption: device.name };

    if (!this._ng_deviceList.includes(entry)) {
      this._ng_deviceList.unshift(entry);
    }

    this._setDropdownDefault(device.name);
  }

  private _removeDropdownElement(device: IDeviceInfo) {
    this._ng_deviceList = this._ng_deviceList.filter(eachDevice => eachDevice.value !== device.name);

    if (this._ng_deviceList.length > 0) {
      this._ng_changeDropdownSelect(this._ng_deviceList[0].value);
      this._setDropdownDefault(this._ng_deviceList[0].value);
    } else {
      this._ng_changeDropdownSelect(undefined);
      this._setDropdownDefault('');
    }
  }

  private _setDropdownDefault(name: string) {
    this._ng_defaultDevice = name;
  }

  private _saveDropdownSession(device: IDeviceInfo) {
    const savedSession = Service.savedSession;

    if (!savedSession[this.session]) {
      savedSession[this.session] = { default: '', devices: [] };
    }

    const found = savedSession[this.session].devices.find(eachDevice => eachDevice.name === device.name);

    if (!found) {
      savedSession[this.session].devices.unshift(device);
    }

    savedSession[this.session].default = device.name;
  }

  private _removeDropdownSession(device: IDeviceInfo) {
    const session: IDeviceSession | undefined = Service.savedSession[this.session];

    if (!session) {
      return;
    }

    session.devices = session.devices.filter(each => each.name !== device.name);

    if (session.default === device.name) {
      session.default = '';
    }

    Service.savedSession[this.session] = session;
  }

  private _restoreDropdownSession() {
    if (Service.savedSession[this.session]) {
      const devices = Service.savedSession[this.session].devices;
      if (devices) {
        for (const device of devices) {
          this._addDropdownElement(device);
        }
      }
    }
  }

  public _ng_changeDropdownSelect(value: string) {
    this._chosenDevice = value;
    this._ng_devices.forEach(device => {
      if (device.name === value && Service.savedSession[this.session]) {
        Service.savedSession[this.session].default = device.name;
      }
    });
  }

  private _loadSession() {
    if (Service.savedSession[this.session]) {
      this._ng_defaultDevice = Service.savedSession[this.session].default;
      this._forceUpdate();
    }
  }

  private _createOptions() {
    const connectedDevices: string[] = this._ng_connected.map(connected => connected.device.name);

    this._ng_devices.forEach(device => {
      if (connectedDevices.indexOf(device.name) === -1) {
        this._deviceOptions.push({
          device: device.name,
          options: this._options.options,
        });
      }
    });
  }

  private _startSpy() {
    this._createOptions();
    Service.startSpy(this._deviceOptions).catch((error: Error) => {
      this._logger.error(error);
    });
  }

  private _closePopup(popup: string) {
    Service.closePopup(popup);
  }

  private _filterDevices(devices: IDeviceInfo[]): IDeviceInfo[] {
    return devices.filter(device => {
      return Service.recentDevices.includes(device.name);
    });
  }

  public _ng_connectDialog(recent: boolean) {
    Service.requestDevices().then((response) => {
      this._startSpy();
      // TODO: Move this popup management into Service like the serial plugin.
      const popupGuid: string = this.api.addPopup({
        caption: 'Choose device to connect:',
        component: {
          factory: SidebarVerticalDeviceDialogComponent,
          inputs: {
            _onConnect: (() => {
              // TODO: The way the serial plugin does it is to have an option UI.
              this._optionsCom = {
                device: this._ng_selected.name,
                options: {}
              };
              Service.stopSpy(this._deviceOptions).then(() => {
                this._deviceOptions = [];
                this._ng_onConnect();
                this._closePopup(popupGuid);
              }).catch((error: Error) => {
                Service.notify('Error', error.message, ENotificationType.error);
              });
            }),
            _ng_canBeConnected: this._ng_canBeConnected,
            _ng_connected: this._ng_connected,
            _ng_onOptions: this._ng_onOptions,
            _ng_onDeviceSelect: this._ng_onDeviceSelect,
            _options: this._deviceOptions,
            _requestDeviceList: () => recent ? this._filterDevices(response.devices) : response.devices,
            _getSelected: (selected: IDeviceInfo) => { this._ng_selected = selected; },
          }
        },
        buttons: [
          {
            caption: 'Cancel',
            handler: () => {
              this._closePopup(popupGuid);
            }
          }
        ]
      });
    }).catch((error: Error) => {
      this._logger.error(`Fail to get ports list due to error: ${error.message}`);
    })
  }
}
