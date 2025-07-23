use chrono::{DateTime, Utc};
use rusqlite::Row;
use sea_query::Iden;
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

#[derive(Iden)]
pub enum NoteIden {
    #[iden = "notes"]
    Table,
    Model,
    Id,
    CreatedAt,
    UpdatedAt,
    Content,
}

impl<'s> TryFrom<&Row<'s>> for Note {
    type Error = rusqlite::Error;

    fn try_from(r: &Row<'s>) -> Result<Self, Self::Error> {
        Ok(Self {
            id: r.get("id")?,
            model: r.get("model")?,
            created_at: r.get("created_at")?,
            updated_at: r.get("updated_at")?,
            content: r.get("content")?,
        })
    }
}

impl Note {
    pub fn new(content: String) -> Self {
        Self {
            content,
            ..Default::default()
        }
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
        let model = value.as_object().unwrap();

        let model = match model.get("model") {
            Some(m) if m == "note" => {
                AnyModel::Note(serde_json::from_value(value).unwrap())
            }
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
