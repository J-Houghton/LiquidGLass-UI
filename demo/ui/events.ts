// Demo-only window events used to coordinate the stage and the config pane.
export const CONTAINERS_CHANGED_EVENT = 'demo-stage:containers-changed';
export const REMOVE_CONTAINER_EVENT = 'demo-stage:remove-container';
export const SELECT_CONTAINER_EVENT = 'demo-stage:select-container';

export type ContainersChangedDetail = { containers: string[]; activeId?: string };
export type ContainerIdDetail = { id: string };

declare global {
  interface WindowEventMap {
    [CONTAINERS_CHANGED_EVENT]: CustomEvent<ContainersChangedDetail>;
    [REMOVE_CONTAINER_EVENT]: CustomEvent<ContainerIdDetail>;
    [SELECT_CONTAINER_EVENT]: CustomEvent<ContainerIdDetail>;
  }
}
