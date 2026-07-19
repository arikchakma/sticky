use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default, TS)]
#[serde(default, rename_all = "camelCase")]
#[ts(export, export_to = "gen_models.ts")]
pub struct Note {
    #[ts(type = "\"note\"")]
    pub model: String,
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub content: String,
}

impl Note {
    pub fn new(content: String) -> Self {
        Self { content, ..Default::default() }
    }
}

pub enum ModelType {
    TypeNote,
}

impl ModelType {
    pub fn id_prefix(&self) -> String {
        match self {
            ModelType::TypeNote => "note",
        }
        .to_string()
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase", untagged)]
#[ts(export, export_to = "gen_models.ts")]
pub enum AnyModel {
    Note(Note),
}

impl<'de> Deserialize<'de> for AnyModel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let model = value
            .as_object()
            .ok_or_else(|| serde::de::Error::custom("expected an object"))?;

        let model = match model.get("model") {
            Some(m) if m == "note" => AnyModel::Note(
                serde_json::from_value(value)
                    .map_err(serde::de::Error::custom)?,
            ),
            Some(m) => {
                return Err(serde::de::Error::custom(format!(
                    "Unknown model {}",
                    m
                )));
            }
            None => {
                return Err(serde::de::Error::custom(
                    "Missing or invalid model",
                ));
            }
        };

        Ok(model)
    }
}
