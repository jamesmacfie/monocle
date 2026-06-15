// Architecture: background command system, generated-action encoding.
// The codec is shared because generated action ids are a message/data
// protocol: background suggestions create them, execution decodes them, and
// the Site SDK validator reserves them so sites cannot collide with Monocle's
// action rows. Keep the background path as the command-system import surface.
export {
  GENERATED_ACTION_PREFIXES,
  GENERATED_ACTION_SUFFIXES,
  type GeneratedCommandAction,
  generatedActionIds,
  isGeneratedCommandActionId,
  parseGeneratedCommandAction,
} from "../../shared/utils/generated-actions"
