import type { TGenericObject } from '@caesar/shared';
import { createElement, type ComponentType } from 'react';

// Dialogs and server screens are picked by enum key and get their props
// through the redux store as a plain object, so which props reach which
// component is not type-checked: this is the one place that pairing is
// trusted. Every component is a ComponentType<never>, whatever its props.
const createDynamicElement = (
    component: ComponentType<never>,
    props: TGenericObject
) => createElement(component as ComponentType<TGenericObject>, props);

export { createDynamicElement };
