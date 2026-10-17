export interface EffectScales {
  small: string;
  medium: string;
  large: string;
  xlarge: string;
}

export interface registeredEffect {
  destroy: () => void;
}

export interface AnimationPosition {
  minPositionX: number;
  maxPositionX: number;
  width: number;
  positionY: number;
}
