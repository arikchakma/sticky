#[cfg(debug_assertions)]
#[macro_export]
macro_rules! debug_log {
    ($($arg:tt)*) => {
        log::debug!($($arg)*)
    };
}

#[cfg(not(debug_assertions))]
#[macro_export]
macro_rules! debug_log {
    ($($arg:tt)*) => {};
}
