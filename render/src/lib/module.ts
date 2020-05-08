import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrimitiveModule } from 'chipmunk-client-primitive';
import { FormsModule } from '@angular/forms';
import { SidebarVerticalComponent } from './views/sidebar.vertical/component';
import { SidebarTitleAddComponent } from './views/dialog/titlebar/components';
import { SidebarVerticalDeviceDialogComponent } from './views/dialog/components';
import { DialogAvailableDeviceComponent } from './views/dialog/device.available/components';
import { SidebarVerticalDeviceConnectedComponent } from './views/sidebar.vertical/device.connected/component';
import { SidebarVerticalDeviceInfoComponent } from './views/sidebar.vertical/device.listed/component';
import * as Toolkit from 'chipmunk.client.toolkit';

const CComponents = [
  SidebarVerticalComponent,
  SidebarTitleAddComponent,
  SidebarVerticalDeviceDialogComponent,
  SidebarVerticalDeviceConnectedComponent,
  SidebarVerticalDeviceInfoComponent,
  DialogAvailableDeviceComponent,
];

@NgModule({
  entryComponents: [...CComponents ],
  declarations: [ ...CComponents ],
  imports: [ CommonModule, FormsModule, PrimitiveModule ],
  exports: [ ...CComponents ]
})

export class PluginModule extends Toolkit.PluginNgModule {

    constructor() {
        super('ADB', 'Show available ADB devices');
    }

}
